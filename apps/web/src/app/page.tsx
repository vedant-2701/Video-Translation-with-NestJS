"use client";

import { useState, useCallback } from "react";
import { UploadZone } from "@/components/UploadZone";
import { LanguageSelector } from "@/components/LanguageSelector";
import { ProgressTracker } from "@/components/ProgressTracker";
import { VideoPlayer } from "@/components/VideoPlayer";
import { useJobProgress } from "@/hooks/useJobProgress";
import {
    uploadVideo,
    getStreamUrl,
    type ProgressEvent,
    type JobStatus,
    downloadVideo,
} from "@/lib/api";

type AppStatus = "idle" | "uploading" | "processing" | "completed" | "failed";

export default function Home() {
    const [file, setFile] = useState<File | null>(null);
    const [sourceLanguage, setSourceLanguage] = useState("en-IN");
    const [targetLanguage, setTargetLanguage] = useState("hi-IN");
    const [status, setStatus] = useState<AppStatus>("idle");
    const [uploadProgress, setUploadProgress] = useState(0);
    const [jobId, setJobId] = useState<string | null>(null);
    const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
    const [currentProgress, setCurrentProgress] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);

    const onProgress = useCallback((event: ProgressEvent) => {
        setProgressEvents((prev) => [...prev, event]);
        setCurrentProgress(event.progress);
    }, []);

    const onComplete = useCallback((_job: JobStatus) => {
        setStatus("completed");
        setCurrentProgress(100);
    }, []);

    const onError = useCallback((message: string) => {
        setStatus("failed");
        setErrorMessage(message);
    }, []);

    useJobProgress({ jobId, onProgress, onComplete, onError });
    

    const handleFileSelected = useCallback((f: File) => {
        setFile(f);
        // Create local object URL for immediate preview
        const url = URL.createObjectURL(f);
        setLocalVideoUrl(url);
        // Reset state for new upload
        setStatus("idle");
        setJobId(null);
        setProgressEvents([]);
        setCurrentProgress(0);
        setErrorMessage(null);
    }, []);

    const handleSubmit = async () => {
        if (!file) return;

        try {
            setStatus("uploading");
            setUploadProgress(0);
            setProgressEvents([]);
            setCurrentProgress(0);
            setErrorMessage(null);

            const response = await uploadVideo(
                file,
                sourceLanguage,
                targetLanguage,
                setUploadProgress,
            );

            setJobId(response.jobId);
            setStatus("processing");
        } catch (err: any) {
            setStatus("failed");
            setErrorMessage(
                err?.response?.data?.message ??
                    "Upload failed. Please try again.",
            );
        }
    };

    const handleReset = () => {
        if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
        setFile(null);
        setLocalVideoUrl(null);
        setJobId(null);
        setStatus("idle");
        setUploadProgress(0);
        setCurrentProgress(0);
        setProgressEvents([]);
        setErrorMessage(null);
    };

    const isBusy = status === "uploading" || status === "processing";
    const showSplit = status === "completed" && jobId;
    // Show original video panel once a file is selected
    const showOriginal = !!localVideoUrl || (!!jobId && status !== "idle");

    return (
        <main className="min-h-screen bg-zinc-950 text-white">
            {/* Header */}
            <header className="border-b border-white/5 px-6 py-4">
                <div className="mx-auto flex max-w-6xl items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xl">🌐</span>
                        <span className="text-base font-semibold tracking-tight">
                            VideoTranslate
                        </span>
                    </div>
                    {(status !== "idle" || file) && (
                        <button
                            onClick={handleReset}
                            className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 ring-1 ring-white/10 transition hover:bg-zinc-800 hover:text-white"
                        >
                            New translation
                        </button>
                    )}
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-6 py-10">
                {/* Top row: upload + config */}
                {status === "idle" && !file && (
                    <div className="mx-auto max-w-xl">
                        <div className="mb-8 text-center">
                            <h1 className="text-3xl font-bold tracking-tight">
                                Translate your video
                            </h1>
                            <p className="mt-2 text-zinc-400">
                                Powered by Sarvam AI — supports 10+ Indian
                                languages
                            </p>
                        </div>

                        <div className="flex flex-col gap-4">
                            <UploadZone onFileSelected={handleFileSelected} />
                            <LanguageSelector
                                sourceLanguage={sourceLanguage}
                                targetLanguage={targetLanguage}
                                onSourceChange={setSourceLanguage}
                                onTargetChange={setTargetLanguage}
                            />
                        </div>
                    </div>
                )}

                {/* File selected but not submitted */}
                {file && status === "idle" && (
                    <div className="mx-auto flex max-w-4xl flex-col gap-6">
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {/* Original preview */}
                            {localVideoUrl && (
                                <VideoPlayer
                                    src={localVideoUrl}
                                    label="Original"
                                />
                            )}

                            {/* Config panel */}
                            <div className="flex flex-col gap-4 rounded-2xl bg-zinc-900 p-5 ring-1 ring-white/10">
                                <div>
                                    <p className="text-sm font-medium text-white">
                                        {file.name}
                                    </p>
                                    <p className="text-xs text-zinc-500">
                                        {(file.size / 1024 / 1024).toFixed(1)}{" "}
                                        MB
                                    </p>
                                </div>

                                <LanguageSelector
                                    sourceLanguage={sourceLanguage}
                                    targetLanguage={targetLanguage}
                                    onSourceChange={setSourceLanguage}
                                    onTargetChange={setTargetLanguage}
                                />

                                <button
                                    onClick={handleSubmit}
                                    className="mt-auto w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 active:scale-[0.98]"
                                >
                                    Translate Video
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Processing / uploading state */}
                {(status === "uploading" || status === "processing") &&
                jobId !== null ? (
                    <div className="mx-auto flex max-w-5xl flex-col gap-6">
                        {/* Videos side by side */}
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {localVideoUrl && (
                                <VideoPlayer
                                    src={localVideoUrl}
                                    label="Original"
                                />
                            )}
                            {/* Translated placeholder while processing */}
                            <div className="flex flex-col gap-2">
                                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                                    Translated
                                </p>
                                <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-zinc-900 ring-1 ring-white/10">
                                    <div className="flex flex-col items-center gap-2 text-zinc-600">
                                        <span className="text-3xl">⏳</span>
                                        <span className="text-xs">
                                            Processing...
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <ProgressTracker
                            events={progressEvents}
                            currentProgress={currentProgress}
                            status={status}
                            uploadProgress={uploadProgress}
                        />
                    </div>
                ) : (
                    status === "uploading" && (
                        // Uploading but no jobId yet
                        <div className="mx-auto flex max-w-5xl flex-col gap-6">
                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                {localVideoUrl && (
                                    <VideoPlayer
                                        src={localVideoUrl}
                                        label="Original"
                                    />
                                )}
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                                        Translated
                                    </p>
                                    <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-zinc-900 ring-1 ring-white/10">
                                        <div className="flex flex-col items-center gap-2 text-zinc-600">
                                            <span className="text-3xl">⬆️</span>
                                            <span className="text-xs">
                                                Uploading {uploadProgress}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <ProgressTracker
                                events={progressEvents}
                                currentProgress={uploadProgress}
                                status="uploading"
                                uploadProgress={uploadProgress}
                            />
                        </div>
                    )
                )}

                {/* Completed */}
                {status === "completed" && jobId && (
                    <div className="mx-auto flex max-w-5xl flex-col gap-6">
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {localVideoUrl && (
                                <VideoPlayer
                                    src={localVideoUrl}
                                    label="Original"
                                />
                            )}
                            <div className="flex flex-col gap-2">
                                <VideoPlayer
                                    src={getStreamUrl("output", jobId)}
                                    label="Translated"
                                />
                                {/* <a
                                    href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api"}/download/${jobId}`}
                                    className="flex items-center
                                justify-center gap-2 rounded-xl bg-emerald-600
                                py-2.5 text-sm font-semibold text-white
                                transition hover:bg-emerald-500"
                                >
                                    ⬇️ Download Translated Video
                                </a> */}
                                <button 
                                    onClick={() => downloadVideo(jobId)}
                                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                                >
                                    Download Translated Video
                                </button>
                            </div>
                        </div>

                        <ProgressTracker
                            events={progressEvents}
                            currentProgress={100}
                            status="completed"
                            uploadProgress={100}
                        />
                    </div>
                )}

                {/* Failed */}
                {status === "failed" && (
                    <div className="mx-auto max-w-xl">
                        <div className="rounded-2xl bg-red-950/40 p-6 ring-1 ring-red-500/30">
                            <p className="font-semibold text-red-400">
                                Translation failed
                            </p>
                            <p className="mt-1 text-sm text-red-300/70">
                                {errorMessage ??
                                    "An unexpected error occurred."}
                            </p>
                            <button
                                onClick={handleReset}
                                className="mt-4 rounded-xl bg-zinc-800 px-4 py-2 text-sm text-white ring-1 ring-white/10 transition hover:bg-zinc-700"
                            >
                                Try again
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
