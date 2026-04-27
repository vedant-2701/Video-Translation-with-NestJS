"use client";

import { useEffect, useRef } from "react";

interface VideoPlayerProps {
    src: string;
    label: string;
    className?: string;
}

export function VideoPlayer({ src, label, className = "" }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        // When src changes, reload the video element
        if (videoRef.current) {
            videoRef.current.load();
        }
    }, [src]);

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                {label}
            </p>
            <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-900 shadow-xl ring-1 ring-white/10">
                <video
                    ref={videoRef}
                    controls
                    preload="metadata"
                    className="aspect-video w-full object-contain"
                >
                    <source src={src} />
                    Your browser does not support the video tag.
                </video>
            </div>
        </div>
    );
}
