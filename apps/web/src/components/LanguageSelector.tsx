"use client";

const LANGUAGES = [
    { code: "en-IN", label: "English (India)" },
    { code: "hi-IN", label: "Hindi" },
    { code: "bn-IN", label: "Bengali" },
    { code: "ta-IN", label: "Tamil" },
    { code: "te-IN", label: "Telugu" },
    { code: "kn-IN", label: "Kannada" },
    { code: "ml-IN", label: "Malayalam" },
    { code: "mr-IN", label: "Marathi" },
    { code: "gu-IN", label: "Gujarati" },
    { code: "pa-IN", label: "Punjabi" },
];

interface LanguageSelectorProps {
    sourceLanguage: string;
    targetLanguage: string;
    onSourceChange: (lang: string) => void;
    onTargetChange: (lang: string) => void;
    disabled?: boolean;
}

export function LanguageSelector({
    sourceLanguage,
    targetLanguage,
    onSourceChange,
    onTargetChange,
    disabled,
}: LanguageSelectorProps) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                    Source
                </label>
                <select
                    value={sourceLanguage}
                    onChange={(e) => onSourceChange(e.target.value)}
                    disabled={disabled}
                    className="w-full rounded-xl bg-zinc-800 px-3 py-2.5 text-sm text-white ring-1 ring-white/10 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40"
                >
                    {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                            {l.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="mt-5 text-zinc-600">→</div>

            <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                    Target
                </label>
                <select
                    value={targetLanguage}
                    onChange={(e) => onTargetChange(e.target.value)}
                    disabled={disabled}
                    className="w-full rounded-xl bg-zinc-800 px-3 py-2.5 text-sm text-white ring-1 ring-white/10 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40"
                >
                    {LANGUAGES.filter((l) => l.code !== sourceLanguage).map(
                        (l) => (
                            <option key={l.code} value={l.code}>
                                {l.label}
                            </option>
                        ),
                    )}
                </select>
            </div>
        </div>
    );
}
