import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, sessionId, files } = await req.json();
    
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Get user from auth token
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get active session
    const { data: session, error: sessionError } = await supabase
      .from("user_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "No active session found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from("user_sessions")
        .update({ status: "expired" })
        .eq("id", sessionId);
      
      return new Response(JSON.stringify({ error: "Session expired" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get token limit for this plan
    const { data: config } = await supabase
      .from("session_config")
      .select("token_limit_per_hour")
      .eq("plan_id", session.plan_id)
      .eq("model_name", session.model_name)
      .single();

    const tokenLimit = config?.token_limit_per_hour || 0;
    const tokensUsed = session.tokens_used || 0;

    // Check if token limit exceeded
    if (tokensUsed >= tokenLimit) {
      return new Response(JSON.stringify({ error: "Token limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Process messages with files for multimodal content
    let processedMessages = [...messages];
    
    // If the last message has files, convert it to multimodal format
    if (files && files.length > 0) {
      const lastMessage = processedMessages[processedMessages.length - 1];
      if (lastMessage.role === "user") {
        const content: any[] = [
          { type: "text", text: lastMessage.content }
        ];
        
        // Add each file to the content array
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            // For images, use image_url format
            content.push({
              type: "image_url",
              image_url: { url: file.content }
            });
          } else if (file.type.startsWith('text/') || file.type === 'text/csv') {
            // For text files, append content as text
            content.push({
              type: "text",
              text: `\n\n[File: ${file.name}]\n${file.content}`
            });
          } else if (file.type === 'application/pdf') {
            // Note: PDF text extraction not available in edge runtime
            content.push({
              type: "text",
              text: `\n\n[PDF Document attached: ${file.name} - Please describe what you'd like to know about this document, or copy/paste the text content for analysis]`
            });
          } else {
            // For other files (DOC, etc.), mention them
            content.push({
              type: "text",
              text: `\n\n[File attached: ${file.name} (${file.type})]`
            });
          }
        }
        
        // Replace the last message with multimodal content
        processedMessages[processedMessages.length - 1] = {
          role: "user",
          content: content
        };
      }
    }

    // Call Lovable AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: session.model_name,
        messages: [
          { role: "system", content: "You are a helpful AI assistant. Keep your responses clear and concise. When files are attached, thoroughly analyze them and provide relevant information. For documents like PDFs, extract key information, summarize content, and answer questions based on what's in the document." },
          ...processedMessages,
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    
    // Update token usage
    const tokensInResponse = data.usage?.total_tokens || 0;
    const newTokensUsed = tokensUsed + tokensInResponse;
    
    await supabase
      .from("user_sessions")
      .update({ tokens_used: newTokensUsed })
      .eq("id", sessionId);

    return new Response(JSON.stringify({
      message: data.choices[0].message.content,
      tokensUsed: newTokensUsed,
      tokenLimit: tokenLimit,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
