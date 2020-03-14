import App from './index';
import { SquooshStartEventType, SquooshSideEventType } from '../compress/index';

import { expose } from 'comlink';

export interface ReadyMessage {
  type: 'READY';
  version: string;
}

export function exposeAPI(app: App) {
  if (window === top) {
    // Someone opened Squoosh in a window rather than an iframe.
    // This can be deceiving and we won’t allow that.
    return;
  }
  self.parent.postMessage({ type: 'READY', version: MAJOR_VERSION }, '*');
  self.addEventListener('message', (event: MessageEvent) => {
    if (event.data !== 'READY?') {
      return;
    }
    event.stopImmediatePropagation();
    self.parent.postMessage({ type: 'READY', version: MAJOR_VERSION } as ReadyMessage, '*');
  });
  expose(new API(app), self.parent);
}

function addRemovableGlobalListener<
  K extends keyof GlobalEventHandlersEventMap
>(name: K, listener: (ev: GlobalEventHandlersEventMap[K]) => void): () => void {
  document.addEventListener(name, listener);
  return () => document.removeEventListener(name, listener);
}

async function querySelectorWait(selector: string): Promise<HTMLInputElement> {
  const el = document.querySelector(selector);
  if (el) {
    return el as HTMLInputElement;
  }

  return new Promise<HTMLInputElement>(resolve => {
    const intervalId = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(intervalId);
        resolve(el as HTMLInputElement);
      }
    }, 100);
  });
}

function dispatchInputEvent(elm: HTMLInputElement): void {
  const ev = new Event("input", {
    bubbles: true,
    cancelable: true,
  });
  elm.dispatchEvent(ev);
}

/**
 * The API class contains the methods that are exposed via Comlink to the
 * outside world.
 */
export class API {
  /**
   * Internal constructor. Do not call.
   */
  constructor(private _app: App) {}

  /**
   * reset
   */
  back() {
    window.history.back();
  }

  /**
   * resizeToLimit
   * @param width  Max width
   * @param height Max height
   */
  async resizeToLimit(width: number, height: number) {
    const enableElm = await querySelectorWait(`[name="resize.enable"]`);
    if (!enableElm.checked) {
      enableElm.click();
    }

    const widthElm = await querySelectorWait(`[name="width"]`);
    const heightElm = await querySelectorWait(`[name="height"]`);

    if (
      parseInt(widthElm.value) / parseInt(heightElm.value) >=
      width / height
    ) {
      widthElm.value = width.toString();
      dispatchInputEvent(widthElm);
    } else {
      heightElm.value = height.toString();
      dispatchInputEvent(heightElm);
    }
  }

  /**
   * set quality
   * @param quality value
   */
  async setQuality(quality: number) {
    const qualityElm = await querySelectorWait(`[name="quality"]`);
    qualityElm.value = quality.toString();
    dispatchInputEvent(qualityElm);
  }

  /**
   * Loads a given file into Squoosh.
   * @param blob The `Blob` to load
   * @param name The name of the file. The extension of this name will be used
   * to deterime which decoder to use.
   */
  setFile(blob: Blob, name: string) {
    return new Promise((resolve) => {
      document.addEventListener(SquooshStartEventType.START, () => resolve(), {
        once: true,
      });
      this._app.openFile(new File([blob], name));
    });
  }

  /**
   * Grabs one side from Squoosh as a `File`.
   * @param side The side which to grab. 0 = left, 1 = right.
   */
  async getBlob(side: 0 | 1) {
    if (!this._app.state.file || !this._app.compressInstance) {
      throw new Error('No file has been loaded');
    }
    if (
      !this._app.compressInstance!.state.loading &&
      !this._app.compressInstance!.state.sides[side].loading
    ) {
      return this._app.compressInstance!.state.sides[side].file;
    }

    const listeners: ReturnType<typeof addRemovableGlobalListener>[] = [];

    const r = new Promise((resolve, reject) => {
      listeners.push(
        addRemovableGlobalListener(SquooshSideEventType.DONE, (event) => {
          if (event.side !== side) {
            return;
          }
          resolve(this._app.compressInstance!.state.sides[side].file);
        }),
      );
      listeners.push(
        addRemovableGlobalListener(SquooshSideEventType.ABORT, (event) => {
          if (event.side !== side) {
            return;
          }
          reject(new DOMException('Aborted', 'AbortError'));
        }),
      );
      listeners.push(
        addRemovableGlobalListener(SquooshSideEventType.ERROR, (event) => {
          if (event.side !== side) {
            return;
          }
          reject(event.error);
        }),
      );
    });
    r.then(() => listeners.forEach(remove => remove()));
    return r;
  }
}
