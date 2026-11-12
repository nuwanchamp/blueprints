// The only bridge between the page and the computer: a short, fixed list of calls. The page gets no Node access.

import { contextBridge, ipcRenderer } from 'electron'
import type { DaybookNative, UpdateStatus } from '../src/native'

const api: DaybookNative = {
  db: (req) => ipcRenderer.invoke('db', req),
  backup: {
    getFolder: () => ipcRenderer.invoke('backup:getFolder'),
    chooseFolder: (title) => ipcRenderer.invoke('backup:chooseFolder', title),
    forgetFolder: () => ipcRenderer.invoke('backup:forgetFolder'),
    write: (sub, name, bytes) => ipcRenderer.invoke('backup:write', sub, name, bytes),
    read: (sub, name) => ipcRenderer.invoke('backup:read', sub, name),
    list: (sub) => ipcRenderer.invoke('backup:list', sub),
    prune: () => ipcRenderer.invoke('backup:prune'),
    usage: () => ipcRenderer.invoke('backup:usage'),
    getRetention: () => ipcRenderer.invoke('backup:getRetention'),
    setRetention: (token, policy) => ipcRenderer.invoke('backup:setRetention', token, policy),
  },
  dataFile: () => ipcRenderer.invoke('dataFile'),
  startError: () => ipcRenderer.invoke('startError'),
  pdf: {
    save: (name, title) => ipcRenderer.invoke('pdf:save', name, title),
    pages: (headings) => ipcRenderer.invoke('pdf:pages', headings),
    open: (path) => ipcRenderer.invoke('pdf:open', path),
  },
  update: {
    getStatus: () => ipcRenderer.invoke('update:getStatus'),
    check: () => ipcRenderer.invoke('update:check'),
    unlock: (pin) => ipcRenderer.invoke('update:unlock', pin),
    download: (token) => ipcRenderer.invoke('update:download', token),
    install: (token) => ipcRenderer.invoke('update:install', token),
    onStatus: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, s: UpdateStatus) => cb(s)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.removeListener('update:status', listener)
    },
  },
}

contextBridge.exposeInMainWorld('daybookNative', api)
