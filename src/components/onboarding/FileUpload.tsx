import { useState, useRef } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';

interface FileUploadProps {
    onFilesChanged: (files: File[]) => void;
    maxFiles?: number;
    accept?: string;
}

export function FileUpload({ onFilesChanged, maxFiles = 5, accept = '.pdf,.txt,.docx' }: FileUploadProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    };

    const handleFiles = (newFiles: File[]) => {
        // Validate
        const validFiles = newFiles.filter(_ => {
            // Add validation log here if needed
            return true;
        });

        const updatedFiles = [...files, ...validFiles].slice(0, maxFiles);
        setFiles(updatedFiles);
        onFilesChanged(updatedFiles);
    };

    const removeFile = (index: number) => {
        const updatedFiles = files.filter((_, i) => i !== index);
        setFiles(updatedFiles);
        onFilesChanged(updatedFiles);
    };

    return (
        <div className="w-full">
            <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                    border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                    ${isDragging
                        ? 'border-primary bg-primary/5 scale-[0.99]'
                        : 'border-border hover:border-primary/50 hover:bg-secondary/50'}
                `}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept={accept}
                    onChange={handleFileInput}
                />

                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <UploadCloud size={32} className="text-primary" />
                </div>

                <h3 className="text-lg font-medium text-foreground mb-1">
                    Arraste arquivos ou clique para upload
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                    PDF, DOCX ou TXT (Max {maxFiles} arquivos)
                </p>

                <button className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
                    Selecionar Arquivos
                </button>
            </div>

            {/* File List */}
            {files.length > 0 && (
                <div className="mt-6 space-y-3">
                    <h4 className="text-sm font-medium text-foreground">Arquivos Selecionados ({files.length})</h4>
                    {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                                    <FileText size={20} className="text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => removeFile(index)}
                                className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-full transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
