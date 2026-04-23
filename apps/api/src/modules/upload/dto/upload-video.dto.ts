import { IsString, Length } from 'class-validator';

export class UploadVideoDto {
  @IsString()
  @Length(2, 10)
  sourceLanguage: string;   // e.g. 'en'

  @IsString()
  @Length(2, 10)
  targetLanguage: string;   // e.g. 'es'
}