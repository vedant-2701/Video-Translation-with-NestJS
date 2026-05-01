"use client";

import { useEffect, useRef, useCallback } from "react";
import { getJobStatus, type ProgressEvent, type JobStatus } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

const RECONNECT_DELAYS = [1000, 2000, 4000]; // exponential backoff with jitter

interface UseJobProgressOptions {
    jobId: string | null;
    onProgress: (event: ProgressEvent) => void;
    onComplete: (job: JobStatus) => void;
    onError: (message: string) => void;
}

export function useJobProgress({
    jobId,
    onProgress,
    onComplete,
    onError,
}: UseJobProgressOptions) {
    const esRef = useRef<EventSource | null>(null);
    const attemptsRef = useRef(0);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const completedRef = useRef(false);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    const startPolling = useCallback(() => {
        if (!jobId || pollingRef.current) return;

        pollingRef.current = setInterval(async () => {
            try {
                const job = await getJobStatus(jobId);

                onProgress({
                    jobId: job.jobId,
                    progress: job.progress,
                    stage: job.status,
                    message: "",
                });

                if (job.status === "COMPLETED") {
                    completedRef.current = true;
                    stopPolling();
                    onComplete(job);
                } else if (job.status === "FAILED") {
                    completedRef.current = true;
                    stopPolling();
                    onError(job.errorMessage ?? "Job failed");
                }
            } catch {
                // polling failure — keep trying
            }
        }, 3000);
    }, [jobId, onProgress, onComplete, onError, stopPolling]);

    const connect = useCallback(() => {
        if (!jobId || completedRef.current) return;

        esRef.current?.close();

        const jitter = Math.random() * 500;
        const delay =
            attemptsRef.current < RECONNECT_DELAYS.length
                ? RECONNECT_DELAYS[attemptsRef.current] + jitter
                : null;

        const doConnect = () => {
            const es = new EventSource(`${API_BASE}/events/${jobId}`);
            esRef.current = es;

            es.onmessage = (event) => {
                attemptsRef.current = 0; // reset on success
                stopPolling();

                try {
                    const data: ProgressEvent = JSON.parse(event.data);
                    onProgress(data);

                    if (data.progress >= 100 || data.stage === "DONE") {
                        completedRef.current = true;
                        es.close();
                        getJobStatus(jobId)
                            .then(onComplete)
                            .catch(() => {});
                    } else if (data.stage === "FAILED") {
                        completedRef.current = true;
                        es.close();
                        onError(data.message ?? "Job failed");
                    }
                } catch {
                    // malformed event — ignore
                }
            };

            es.onerror = () => {
                es.close();
                attemptsRef.current += 1;

                if (attemptsRef.current <= RECONNECT_DELAYS.length) {
                    // Reconnect with delay — only on subsequent attempts
                    const jitter = Math.random() * 500;
                    const delay  = RECONNECT_DELAYS[attemptsRef.current - 1] + jitter;
                    setTimeout(doConnect, delay);
                } else {
                    // All SSE attempts exhausted — fall back to polling
                    startPolling();
                }
            };
        };

        if (delay !== null) {
            setTimeout(doConnect, delay);
        } else {
            doConnect();
        }
    }, [jobId, onProgress, onComplete, onError, stopPolling, startPolling]);

    useEffect(() => {
        if (!jobId) return;

        attemptsRef.current = 0;
        completedRef.current = false;

        connect();

        return () => {
            esRef.current?.close();
            stopPolling();
        };
    }, [jobId, connect, stopPolling]);
}
