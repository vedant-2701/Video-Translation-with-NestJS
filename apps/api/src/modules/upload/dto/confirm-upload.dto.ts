import { IsString } from "class-validator";

export class ConfirmUploadDto {
    /** The s3Key returned from /upload/init — used to verify file exists in MinIO. */
    @IsString()
    s3Key!: string;
}
