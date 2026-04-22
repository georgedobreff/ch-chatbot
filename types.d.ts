declare module 'pdf-parse' {
    interface PdfParseOptions {
        pagerender?: (pageData: any) => string;
        max?: number;
        version?: string;
    }

    interface PdfParseResult {
        numpages: number;
        numrender: number;
        info: any;
        metadata: any;
        text: string;
        version: string;
    }

    function PDFParse(dataBuffer: Buffer, options?: PdfParseOptions): Promise<PdfParseResult>;

    export default PDFParse;
}
