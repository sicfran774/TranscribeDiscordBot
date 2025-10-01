declare module "wav" {
  import { Writable } from "stream";

  export class Writer extends Writable {
    constructor(options?: {
      sampleRate?: number;
      channels?: number;
      bitDepth?: number;
    });
  }
}
