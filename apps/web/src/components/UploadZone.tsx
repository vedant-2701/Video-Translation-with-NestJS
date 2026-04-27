"use client";

import { useCallback, useRef, useState } from "react";

interface UploadZoneProps {
    onFileSelected: (file: File) => void;
    disabled?: boolean;
}

const ACCEPTED = [
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
];

export function UploadZone({ onFileSelected, disabled }: UploadZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [drag, setDrag] = useState(false);

    const handleFile = useCallback(
        (file: File) => {
            if (
                !ACCEPTED.includes(file.type) &&
                !file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i)
            ) {
                alert(
                    "Please upload a valid video file (mp4, webm, mov, avi, mkv)",
                );
                return;
            }
            onFileSelected(file);
        },
        [onFileSelected],
    );

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDrag(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    return (
        <div
            onClick={() => !disabled && inputRef.current?.click()}
            onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200 ${
                disabled
                    ? "cursor-not-allowed border-zinc-800 opacity-40"
                    : drag
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
            }`}
        >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-2xl">
                🎬
            </div>
            <div>
                <p className="text-sm font-medium text-white">
                    Drop your video here or{" "}
                    <span className="text-indigo-400 underline underline-offset-2">
                        browse
                    </span>
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                    MP4, WebM, MOV, AVI, MKV — up to 500 MB
                </p>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.mov,.avi,.mkv"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                }}
            />
        </div>
    );
}
