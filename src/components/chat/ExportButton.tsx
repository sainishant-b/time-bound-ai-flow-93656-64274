import { Button } from "@/components/ui/button";
import { Download, FileText, FileCode } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

interface Message {
  role: string;
  content: string;
  created_at: string;
}

interface ExportButtonProps {
  title: string;
  messages: Message[];
}

export const ExportButton = ({ title, messages }: ExportButtonProps) => {
  const { toast } = useToast();

  const exportAsText = () => {
    const content = messages
      .map(msg => `[${msg.role.toUpperCase()}]\n${msg.content}\n`)
      .join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    downloadFile(blob, `${title}.txt`);
  };

  const exportAsMarkdown = () => {
    const content = `# ${title}\n\n${messages
      .map(msg => `## ${msg.role === 'user' ? 'You' : 'AI'}\n\n${msg.content}\n`)
      .join('\n')}`;
    
    const blob = new Blob([content], { type: 'text/markdown' });
    downloadFile(blob, `${title}.md`);
  };

  const exportAsPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - 2 * margin;
      let y = 20;

      // Title
      doc.setFontSize(16);
      doc.text(title, margin, y);
      y += 15;

      // Messages
      doc.setFontSize(10);
      messages.forEach(msg => {
        // Role
        doc.setFont(undefined, 'bold');
        doc.text(msg.role === 'user' ? 'You:' : 'AI:', margin, y);
        y += 7;

        // Content
        doc.setFont(undefined, 'normal');
        const lines = doc.splitTextToSize(msg.content, maxWidth);
        
        lines.forEach((line: string) => {
          if (y > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage();
            y = 20;
          }
          doc.text(line, margin, y);
          y += 5;
        });

        y += 10;
      });

      doc.save(`${title}.pdf`);
      
      toast({
        title: "Success",
        description: "Conversation exported as PDF",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export as PDF",
        variant: "destructive",
      });
    }
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Success",
      description: `Conversation exported as ${filename}`,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Download className="w-3.5 h-3.5 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAsText}>
          <FileText className="w-4 h-4 mr-2" />
          Export as Text
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsMarkdown}>
          <FileCode className="w-4 h-4 mr-2" />
          Export as Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsPDF}>
          <Download className="w-4 h-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
