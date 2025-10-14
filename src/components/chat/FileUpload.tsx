import { useState, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FileUploadProps {
  onFilesSelected: (files: { name: string; type: string; content: string }[]) => void;
}

export interface FileUploadHandle {
  clear: () => void;
}

export const FileUpload = forwardRef<FileUploadHandle, FileUploadProps>(({ onFilesSelected }, ref) => {
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const isPDF = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');
      const isUnder10MB = file.size <= 10 * 1024 * 1024; // 10MB limit

      if (!isPDF && !isImage) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a PDF or image`,
          variant: "destructive",
        });
        return false;
      }

      if (!isUnder10MB) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit`,
          variant: "destructive",
        });
        return false;
      }

      return true;
    });

    if (validFiles.length > 0) {
      const newFiles = [...selectedFiles, ...validFiles];
      setSelectedFiles(newFiles);
      
      // Convert all files to base64 for sending
      const processedFiles = await Promise.all(
        newFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            name: file.name,
            type: file.type,
            content: base64,
          };
        })
      );

      onFilesSelected(processedFiles);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const removeFile = async (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    
    // Update parent with remaining files
    if (newFiles.length > 0) {
      const processedFiles = await Promise.all(
        newFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            name: file.name,
            type: file.type,
            content: base64,
          };
        })
      );
      onFilesSelected(processedFiles);
    } else {
      onFilesSelected([]);
    }
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    onFilesSelected([]);
  };

  useImperativeHandle(ref, () => ({
    clear: clearAllFiles
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => document.getElementById('file-upload')?.click()}
          className="h-8"
        >
          <Paperclip className="w-3.5 h-3.5 mr-2" />
          Attach Files
        </Button>
        <input
          id="file-upload"
          type="file"
          multiple
          accept="application/pdf,image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-1.5 bg-secondary border border-border rounded text-xs"
            >
              {file.type.startsWith('image/') ? (
                <ImageIcon className="w-3 h-3" />
              ) : (
                <FileText className="w-3 h-3" />
              )}
              <span className="max-w-[150px] truncate">{file.name}</span>
              <button
                onClick={() => removeFile(index)}
                className="hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

FileUpload.displayName = "FileUpload";
