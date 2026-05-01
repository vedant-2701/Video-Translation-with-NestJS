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
    status: "PENDING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
    progress: number;
    sourceLanguage: string;
    targetLanguage: string;
    inputFilename: string;
    errorMessage: string | null;
    downloadReady: boolean;
    s3SubtitleEnKey: string | null;
    s3SubtitleHiKey: string | null;
    subtitlesReady: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ProgressEvent {
    jobId: string;
    progress: number;
    stage: string;
    message: string;
    isReplay?: boolean;
}

export interface UploadInitResponse {
    jobId: string;
    presignedUrl: string;
    s3Key: string;
}

export const uploadVideoInit = async (
    file: File,
    sourceLanguage: string,
    targetLanguage: string,
): Promise<UploadInitResponse> => {
    const { data } = await api.post<UploadInitResponse>("/upload/init", {
        filename: file.name,
        fileSizeMb: parseFloat((file.size / 1024 / 1024).toFixed(3)),
        sourceLanguage,
        targetLanguage,
    });

    return data;
};

export const uploadVideoPutPresigned = async (
    presignedUrl: string,
    file: File,
    onUploadProgress?: (pct: number) => void,
): Promise<void> => {
    await axios.put(presignedUrl, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
        onUploadProgress: (e) => {
            if (e.total)
                onUploadProgress?.(Math.round((e.loaded / e.total) * 100));
        },
    });
};

export const uploadVideoConfirm = async (
    jobId: string,
    s3Key: string,
): Promise<UploadResponse> => {
    const { data } = await api.post<UploadResponse>(
        `/upload/${jobId}/confirm`,
        {
            s3Key,
        },
    );

    return data;
};

export const uploadVideo = async (
    file: File,
    sourceLanguage: string,
    targetLanguage: string,
    onUploadProgress?: (pct: number) => void,
): Promise<UploadResponse> => {
    // Step 1: Initialize upload
    const initRes = await uploadVideoInit(file, sourceLanguage, targetLanguage);

    // Step 2: Upload file to presigned URL
    await uploadVideoPutPresigned(initRes.presignedUrl, file, onUploadProgress);

    // Step 3: Confirm upload
    const confirmRes = await uploadVideoConfirm(initRes.jobId, initRes.s3Key);

    console.log('[uploadVideo] confirmRes:', confirmRes);
    return confirmRes;
};

export const downloadVideo = async (jobId: string): Promise<void> => {
    const { data } = await api.get<{ url: string; filename: string }>(
        `/download/${jobId}`,
    );

    // Fetch the actual video bytes then trigger download
    const response = await fetch(data.url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
};

export const getJobStatus = async (jobId: string): Promise<JobStatus> => {
    const { data } = await api.get<JobStatus>(`/jobs/${jobId}`);
    return data;
};

export const getStreamUrl = (type: "input" | "output", jobId: string) =>
    `${API_BASE}/stream/${type}/${jobId}`;

export interface SubtitleResponse {
    url?: string;  // presigned URL for S3/MinIO
    text?: string; // VTT file content for local storage
}

export const getSubtitleUrl = async (
    jobId: string,
    lang: 'en' | 'hi',
): Promise<SubtitleResponse> => {
    const { data } = await api.get<SubtitleResponse>(
        `/jobs/${jobId}/subtitle-url/${lang}`,
    );
    return data;
};
