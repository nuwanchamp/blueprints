// In the desktop app the backup folder is a real folder that the main process writes to. This wraps it in the
// small part of the browser's folder-handle API that backup.ts uses, so the backup code has one path for both.

import type { NativeFolder } from '@/native'

type Native = NonNullable<Window['daybookNative']>

function fileHandle(api: Native, sub: string, name: string) {
  return {
    kind: 'file' as const,
    name,
    async getFile() {
      return new File([(await api.backup.read(sub, name)) as BlobPart], name)
    },
    async createWritable() {
      const parts: Blob[] = []
      return {
        write: async (data: Blob) => void parts.push(data),
        close: async () => api.backup.write(sub, name, new Uint8Array(await new Blob(parts).arrayBuffer())),
      }
    },
  }
}

function dirHandle(api: Native, sub: string) {
  return {
    kind: 'directory' as const,
    name: sub,
    getFileHandle: async (name: string) => fileHandle(api, sub, name),
    async *values() {
      for (const name of await api.backup.list(sub)) yield fileHandle(api, sub, name)
    },
  }
}

/** The chosen folder as a handle; writing needs no permission prompt, the person picked it in the app. */
export function nativeFolderHandle(api: Native, folder: NativeFolder): FileSystemDirectoryHandle {
  const h = {
    kind: 'directory' as const,
    name: folder.name,
    path: folder.path,
    queryPermission: async () => 'granted' as const,
    requestPermission: async () => 'granted' as const,
    getDirectoryHandle: async (sub: string) => dirHandle(api, sub),
  }
  return h as unknown as FileSystemDirectoryHandle
}
