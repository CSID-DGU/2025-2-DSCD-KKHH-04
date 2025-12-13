// 추후 websocekt 연결시 사용

import * as msgpack from "@msgpack/msgpack";
import type { ISeqTransport, Frame } from './seqTransport';

export class WsTransport implements ISeqTransport {
  private ws: WebSocket;
  private buf: Frame[] = [];
  private timer?: number;

  constructor(url: string, private sessionId: string, private fps=30){
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
  }

  pushFrame(f: Frame) {
    this.buf.push(f);
    if (!this.timer) this.timer = window.setTimeout(() => this.flush(), 500);
    if (this.buf.length >= 60) this.flush();
  }

  flush() {
    if (!this.buf.length || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = { session_id: this.sessionId, fps: this.fps, frames: this.buf };
    this.ws.send(msgpack.encode(payload));
    this.buf = [];
    if (this.timer) { window.clearTimeout(this.timer); this.timer = undefined; }
  }

  close(){ this.flush(); this.ws.close(); }
}
