import { IsString, Length, IsNumber, Min, Max } from "class-validator";

export class InitUploadDto {
    @IsString()
    filename!: string;

    @IsString()
    @Length(2, 10)
    sourceLanguage!: string;

    @IsString()
    @Length(2, 10)
    targetLanguage!: string;

    /** File size in MB — validated against MAX_FILE_SIZE_MB. */
    @IsNumber()
    @Min(0.01)
    @Max(2000)
    fileSizeMb!: number;
}
