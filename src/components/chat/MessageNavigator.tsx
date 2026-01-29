import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { List, Search, User, Sparkles } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  files?: Array<{
    name: string;
    type: string;
    size: number;
    content: string;
  }>;
}

interface MessageNavigatorProps {
  messages: Message[];
  onMessageClick: (index: number) => void;
}

export const MessageNavigator = ({
  messages,
  onMessageClick,
}: MessageNavigatorProps) => {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filteredMessages = useMemo(() => {
    if (!search.trim()) {
      return messages.map((msg, idx) => ({ ...msg, originalIndex: idx }));
    }
    
    const searchLower = search.toLowerCase();
    return messages
      .map((msg, idx) => ({ ...msg, originalIndex: idx }))
      .filter((msg) =>
        msg.content.toLowerCase().includes(searchLower)
      );
  }, [messages, search]);

  const getPreview = (content: string) => {
    const maxLength = 60;
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
  };

  const handleSelect = (originalIndex: number) => {
    onMessageClick(originalIndex);
    setOpen(false);
    setSearch("");
  };

  if (messages.length <= 1) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          title="Jump to message"
        >
          <List className="h-4 w-4" />
          <span className="hidden sm:inline">Messages</span>
          <span className="text-xs text-muted-foreground">
            ({messages.length})
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0 z-50 bg-popover border shadow-lg" 
        align="start"
        sideOffset={8}
      >
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-2 space-y-1">
            {filteredMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No messages found
              </p>
            ) : (
              filteredMessages.map((msg) => (
                <button
                  key={msg.originalIndex}
                  onClick={() => handleSelect(msg.originalIndex)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors flex items-start gap-2 group"
                >
                  <div className="shrink-0 mt-0.5">
                    {msg.role === "user" ? (
                      <User className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">
                      {msg.role === "user" ? "You" : "AI"}
                      <span className="ml-2 text-muted-foreground/60">
                        #{msg.originalIndex + 1}
                      </span>
                    </p>
                    <p className="text-sm truncate group-hover:text-foreground">
                      {getPreview(msg.content)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
