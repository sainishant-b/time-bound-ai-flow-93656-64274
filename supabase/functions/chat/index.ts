import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function extractBasicPdfInfo(base64Content: string): Promise<string> {
  try {
    console.log('Processing PDF document...');

    // Remove data URL prefix if present
    const base64Data = base64Content.includes(',')
      ? base64Content.split(',')[1]
      : base64Content;

    // Convert to bytes to get basic info
    const binaryString = atob(base64Data);
    const sizeInKB = Math.round(binaryString.length / 1024);

    console.log(`PDF size: ${sizeInKB}KB`);

    // Return a message indicating PDF is attached
    return `[PDF Document Information]\nSize: ${sizeInKB}KB\n\nNote: Due to the limitations of this chat environment, I cannot directly access or process the content of the attached PDF document. PDFs are not parsed server-side in this application.\n\nTo help you with the PDF, please:\n**paste the relevant text from the document** into our chat, or tell me:\n**What specific information are you looking for?**\n**What questions do you have about the document?**\n**Are there any particular sections you'd like me to analyze?**\n\nOnce you provide the text, I'll be happy to assist you!`;

  } catch (error) {
    console.error('PDF processing error:', error);
    return `[PDF document attached but cannot be processed. Please paste the relevant content from the PDF that you'd like help with]`;
  }
}

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
    
    console.log('Files received:', files ? files.length : 0);
    if (files) {
      console.log('File types:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));
    }
    
    // If the last message has files, append file content to the message
    if (files && files.length > 0) {
      const lastMessage = processedMessages[processedMessages.length - 1];
      if (lastMessage.role === "user") {
        let messageText = lastMessage.content;
        const imageFiles: any[] = [];
        
        // Process each file
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            // Collect images for multimodal format
            imageFiles.push({
              type: "image_url",
              image_url: { url: file.content }
            });
          } else if (file.type.startsWith('text/') || file.type === 'text/csv') {
            // For text files, append content as text
            messageText += `\n\n[File: ${file.name}]\n${file.content}`;
          } else if (file.type === 'application/pdf') {
            // PDF content is already extracted text from client-side parsing
            console.log('✅ PDF text content received from client, length:', file.content.length);
            console.log('PDF preview:', file.content.substring(0, 300));
            messageText += `\n\n[PDF Document: ${file.name}]\n\n${file.content}`;
          } else {
            // For other files (DOC, etc.), mention them
            messageText += `\n\n[File attached: ${file.name} (${file.type})]`;
          }
        }
        
        // If there are images, use multimodal format, otherwise use simple text
        if (imageFiles.length > 0) {
          const content: unknown[] = [
            { type: "text", text: messageText },
            ...imageFiles
          ];
          processedMessages[processedMessages.length - 1] = {
            role: "user",
            content: content
          };
          console.log('Processed message with images (multimodal)');
        } else {
          // For text-only content (including PDFs), use simple string format
          processedMessages[processedMessages.length - 1] = {
            role: "user",
            content: messageText
          };
          console.log('Processed message with text content, length:', messageText.length);
        }
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
