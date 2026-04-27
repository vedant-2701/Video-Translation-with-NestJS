import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

export const api = axios.create({
    baseURL: API_BASE,
});

export interface UploadResponse {
    jobId: string;
    status: string;
    sourceLanguage: string;
    targetLanguage: string;
    message: string;
}

export interface JobStatus {
    jobId: string;
    status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
    progress: number;
    sourceLanguage: string;
    targetLanguage: string;
    inputFilename: string;
    errorMessage: string | null;
    downloadReady: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ProgressEvent {
    jobId: string;
    progress: number;
    stage: string;
    message: string;
}

export const uploadVideo = async (
    file: File,
    sourceLanguage: string,
    targetLanguage: string,
    onUploadProgress?: (pct: number) => void,
): Promise<UploadResponse> => {
    const form = new FormData();
    form.append("video", file);
    form.append("sourceLanguage", sourceLanguage);
    form.append("targetLanguage", targetLanguage);

    const { data } = await api.post<UploadResponse>("/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
            if (e.total)
                onUploadProgress?.(Math.round((e.loaded / e.total) * 100));
        },
    });

    return data;
};

export const getJobStatus = async (jobId: string): Promise<JobStatus> => {
    const { data } = await api.get<JobStatus>(`/jobs/${jobId}`);
    return data;
};

export const getStreamUrl = (type: "input" | "output", jobId: string) =>
    `${API_BASE}/stream/${type}/${jobId}`;
