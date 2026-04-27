import { Controller, Get, Param, Req, Res, Headers } from "@nestjs/common";
import type { Request, Response } from "express";
import { StreamService } from "./stream.service";
import * as fs from "fs";

@Controller("stream")
export class StreamController {
    constructor(private readonly streamService: StreamService) {}

    /** GET /api/stream/input/:jobId — stream original uploaded video */
    @Get("input/:jobId")
    async streamInput(
        @Param("jobId") jobId: string,
        @Headers("range") rangeHeader: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const target = await this.streamService.resolveInput(jobId);
        return this.streamVideo(target, rangeHeader, res);
    }

    /** GET /api/stream/output/:jobId — stream translated video */
    @Get("output/:jobId")
    async streamOutput(
        @Param("jobId") jobId: string,
        @Headers("range") rangeHeader: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const target = await this.streamService.resolveOutput(jobId);
        return this.streamVideo(target, rangeHeader, res);
    }

    private streamVideo(
        target: { filePath: string; fileSize: number; mimeType: string },
        rangeHeader: string,
        res: Response,
    ) {
        const { filePath, fileSize, mimeType } = target;

        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", mimeType);

        if (!rangeHeader) {
            // No range — send full file
            res.setHeader("Content-Length", fileSize);
            fs.createReadStream(filePath).pipe(res);
            return;
        }

        // Parse Range header: "bytes=start-end"
        const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-");
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
            res.setHeader("Content-Range", `bytes */${fileSize}`);
            res.status(416).end();
            return;
        }

        const chunkSize = end - start + 1;

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", chunkSize);

        fs.createReadStream(filePath, { start, end }).pipe(res);
    }
}
