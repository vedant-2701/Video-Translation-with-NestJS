"use client";

import { useEffect, useRef } from "react";

interface VideoPlayerProps {
    src: string;
    label: string;
    className?: string;
    subtitleEnUrl?: string;
    subtitleHiUrl?: string;
}

export function VideoPlayer({
    src,
    label,
    className = "",
    subtitleEnUrl,
    subtitleHiUrl,
}: VideoPlayerProps) {
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
                    {subtitleEnUrl && (
                        <track
                            kind="subtitles"
                            label="English"
                            srcLang="en"
                            src={subtitleEnUrl}
                            default
                        />
                    )}
                    {subtitleHiUrl && (
                        <track
                            kind="subtitles"
                            label="Hindi"
                            srcLang="hi"
                            src={subtitleHiUrl}
                        />
                    )}
                    Your browser does not support the video tag.
                </video>
            </div>
        </div>
    );
}
