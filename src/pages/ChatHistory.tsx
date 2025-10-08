import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Sparkles, MessageSquare, Trash2, ArrowLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export default function ChatHistory() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    checkAuth();
    loadConversations();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
    } else {
      setUserEmail(user.email || "");
    }
  };

  const loadConversations = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('conversations')
        .select(`
          *,
          chat_messages(count)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const conversationsWithCount = data?.map((conv: any) => ({
        ...conv,
        message_count: conv.chat_messages?.[0]?.count || 0
      })) || [];

      setConversations(conversationsWithCount);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await (supabase as any)
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleConversationClick = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    await loadMessages(conversation.id);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await (supabase as any)
        .from('conversations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Conversation deleted successfully",
      });

      if (selectedConversation?.id === id) {
        setSelectedConversation(null);
        setMessages([]);
      }

      loadConversations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background">
        <div className="container flex h-14 items-center justify-between px-4 mx-auto">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/home')}>
              <div className="w-7 h-7 rounded-full border border-foreground flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-lg font-light tracking-tight">AI Access Hub</span>
            </div>
            <nav className="hidden md:flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/home')} className="h-8 px-3">
                Home
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="h-8 px-3">
                Dashboard
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-3 bg-secondary">
                Chat History
              </Button>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground hidden sm:inline">{userEmail}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="h-8 px-3">
              <LogOut className="w-3 h-3 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Conversations List */}
          <div className="lg:col-span-1 space-y-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Chat History</h1>
              <p className="text-sm text-muted-foreground">Your conversations</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-pulse">Loading...</div>
              </div>
            ) : conversations.length === 0 ? (
              <Card className="border shadow-none">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    No conversations yet
                  </p>
                  <Button onClick={() => navigate('/dashboard')} size="sm">
                    Go to Dashboard
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[calc(100vh-240px)]">
                <div className="space-y-2 pr-4">
                  {conversations.map((conversation) => (
                    <Card 
                      key={conversation.id}
                      className={`group border shadow-none cursor-pointer transition-all hover:border-foreground/50 animate-fade-up ${
                        selectedConversation?.id === conversation.id ? 'border-foreground bg-secondary' : ''
                      }`}
                      onClick={() => handleConversationClick(conversation)}
                    >
                      <CardHeader className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 flex-1 min-w-0">
                            <CardTitle className="text-sm font-medium truncate">{conversation.title}</CardTitle>
                            <CardDescription className="text-xs">
                              {conversation.message_count} messages • {format(new Date(conversation.updated_at), 'MMM d')}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleDelete(conversation.id, e)}
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Conversation Details */}
          <div className="lg:col-span-2">
            {selectedConversation ? (
              <Card className="border shadow-none h-[calc(100vh-180px)]">
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedConversation(null)}
                        className="lg:hidden"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </Button>
                      <div>
                        <CardTitle className="text-lg font-light">{selectedConversation.title}</CardTitle>
                        <CardDescription className="text-xs">
                          Started {format(new Date(selectedConversation.created_at), 'MMM d, yyyy • h:mm a')}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100vh-300px)] p-6">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-pulse">Loading messages...</div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((message) => (
                          <div
                            key={message.id}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg px-4 py-3 ${
                                message.role === 'user'
                                  ? 'bg-foreground text-background'
                                  : 'bg-secondary text-foreground border border-border'
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                              <p className="text-xs mt-2 opacity-60">
                                {format(new Date(message.created_at), 'h:mm a')}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              <Card className="border shadow-none h-[calc(100vh-180px)]">
                <CardContent className="flex flex-col items-center justify-center h-full">
                  <MessageSquare className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">Select a conversation</p>
                  <p className="text-sm text-muted-foreground">
                    Choose a conversation from the list to view messages
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
