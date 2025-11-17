import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
// @ts-ignore
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@3.11.174/build/pdf.min.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function extractPdfText(base64Content: string): Promise<string> {
  try {
    console.log('Starting PDF text extraction...');

    // Remove data URL prefix if present
    const base64Data = base64Content.includes(',')
      ? base64Content.split(',')[1]
      : base64Content;

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    console.log('PDF bytes length:', bytes.length);

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    console.log('PDF loaded, pages:', pdf.numPages);

    let fullText = '';

    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');

      fullText += `\n--- Page ${pageNum} ---\n${pageText}\n`;
    }

    console.log('PDF text extraction successful, length:', fullText.length);
    return fullText.trim() || "[PDF document appears to be empty or contains only images]";

  } catch (error) {
    console.error('PDF extraction error:', error);
    return `[Error processing PDF file: ${error instanceof Error ? error.message : 'Unknown error'}]`;
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
            // Extract PDF text content
            try {
              const pdfText = await extractPdfText(file.content);
              content.push({
                type: "text",
                text: `\n\n[PDF Document: ${file.name}]\n${pdfText}`
              });
            } catch (error) {
              console.error('PDF parsing error for', file.name, ':', error);
              content.push({
                type: "text",
                text: `\n\n[Unable to parse PDF: ${file.name}. Error: ${error instanceof Error ? error.message : 'Unknown error'}]`
              });
            }
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
        
        console.log('Processed message with files:', JSON.stringify(content, null, 2));
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
