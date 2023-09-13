import type * as _electron from "electron";
import { Observable, from } from "rxjs";

export namespace ElectronUtils {

    export const electron: typeof _electron | undefined = window.require?.("electron");

    export function invoke<T = any>(channel: string, ...args: any[]): Observable<T> {
        return from(electron?.ipcRenderer.invoke(channel, ...args) ?? Promise.resolve());
    }
}