import {
    Controller,
    Get,
    Param,
    Req,
    Res,
    Headers,
    Redirect,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { StreamService } from "./stream.service";
import * as fs from "fs";

/**
 * StreamController
 *
 * MinIO driver:
 *   Returns 302 redirect to a presigned MinIO GET URL.
 *   Browser/video player follows the redirect and streams directly from MinIO.
 *   NestJS never touches the video bytes.
 *
 * Local driver (dev fallback):
 *   Streams the file from disk using range requests (unchanged from original).
 */
@Controller("stream")
export class StreamController {
    constructor(private readonly streamService: StreamService) {}

    @Get("input/:jobId")
    async streamInput(
        @Param("jobId") jobId: string,
        @Headers("range") rangeHeader: string,
        @Res() res: Response,
    ) {
        const target = await this.streamService.resolveInput(jobId);
        return this._respond(target, rangeHeader, res);
    }

    @Get("output/:jobId")
    async streamOutput(
        @Param("jobId") jobId: string,
        @Headers("range") rangeHeader: string,
        @Res() res: Response,
    ) {
        const target = await this.streamService.resolveOutput(jobId);
        return this._respond(target, rangeHeader, res);
    }

    private _respond(
        target: Awaited<ReturnType<StreamService["resolveInput"]>>,
        rangeHeader: string,
        res: Response,
    ) {
        // MinIO driver — redirect, let browser stream directly from MinIO
        if (target.presignedUrl) {
            return res.redirect(302, target.presignedUrl);
        }

        // Local driver — stream from disk with range support
        const { filePath, fileSize, mimeType } = target;

        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", mimeType);

        if (!rangeHeader) {
            res.setHeader("Content-Length", fileSize!);
            fs.createReadStream(filePath!).pipe(res);
            return;
        }

        const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-");
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : fileSize! - 1;

        if (start >= fileSize! || end >= fileSize!) {
            res.setHeader("Content-Range", `bytes */${fileSize}`);
            return res.status(416).end();
        }

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", end - start + 1);
        fs.createReadStream(filePath!, { start, end }).pipe(res);
    }
}
