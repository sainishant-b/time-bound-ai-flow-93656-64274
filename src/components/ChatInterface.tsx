import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatInterfaceProps {
  session: any;
  onTokenUpdate?: (tokensUsed: number, tokenLimit: number) => void;
}

interface Conversation {
  id: string;
  title: string;
}

export const ChatInterface = ({ session, onTokenUpdate }: ChatInterfaceProps) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hello! I'm ${session.model_name.replace(/-/g, ' ')}. How can I help you today?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createConversation = async (firstMessage: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
      
      const { data, error } = await (supabase as any)
        .from('conversations')
        .insert({
          user_id: user.id,
          session_id: session.id,
          title: title,
        })
        .select()
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  };

  const saveMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!conversationId) return;

    try {
      const { error } = await (supabase as any)
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          role,
          content,
        });

      if (error) {
        console.error('Error saving message:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      role: "user",
      content: input,
    };

    // Create conversation on first message
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      currentConversationId = await createConversation(input);
      if (currentConversationId) {
        setConversationId(currentConversationId);
      }
    }

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Save user message
    if (currentConversationId) {
      await saveMessage('user', userMessage.content);
    }

    try {
      const { data, error } = await supabase.functions.invoke("chat", {
        body: {
          messages: [...messages, userMessage],
          sessionId: session.id,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        setIsTyping(false);
        return;
      }

      const aiResponse: Message = {
        role: "assistant",
        content: data.message,
      };

      setMessages((prev) => [...prev, aiResponse]);
      
      // Save AI response
      if (currentConversationId) {
        await saveMessage('assistant', aiResponse.content);
      }
      
      // Update parent component with new token count
      if (onTokenUpdate) {
        onTokenUpdate(data.tokensUsed, data.tokenLimit);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="border shadow-none">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-lg font-light">
          <Sparkles className="w-4 h-4" />
          Chat with {session.model_name.replace(/google\/|gemini-|-/g, ' ')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[500px] overflow-y-auto space-y-3 p-4 rounded border border-border">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded px-4 py-3 ${
                  message.role === "user"
                    ? "bg-foreground text-background"
                    : "bg-secondary text-foreground border border-border"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-secondary border border-border rounded px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-foreground animate-bounce" />
                  <div className="w-1.5 h-1.5 rounded-full bg-foreground animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-foreground animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex gap-2">
          <Textarea
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            className="min-h-[60px] max-h-[120px] resize-none"
            disabled={isTyping}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            size="icon"
            className="h-[60px] w-[60px] shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Powered by {session.model_name.replace(/google\//g, '')}
        </p>
      </CardContent>
    </Card>
  );
};
