import client from 'client/client';
import {
  Dialog,
  DialogPeer,
  Document, InputChannel,
  InputDialogPeer,
  InputPeer,
  InputUser,
  Message,
  Peer,
  Updates,
  UserStatus,
} from 'mtproto-js';
import { todoAssertHasValue } from './other';

export function peerToId(peer: Peer): string {
  switch (peer._) {
    case 'peerChannel': return `channel_${peer.channel_id}`;
    case 'peerChat': return `chat_${peer.chat_id}`;
    case 'peerUser': return `user_${peer.user_id}`;
    default: throw TypeError('Unknown peer type');
  }
}

export function peerIdToPeer(id: string): Peer {
  if (id.startsWith('channel_')) {
    return { _: 'peerChannel', channel_id: Number(id.slice(8)) };
  }
  if (id.startsWith('chat_')) {
    return { _: 'peerChat', chat_id: Number(id.slice(5)) };
  }
  if (id.startsWith('user_')) {
    return { _: 'peerUser', user_id: Number(id.slice(5)) };
  }
  throw TypeError('Unknown peer type');
}

export function peerToDialogId(peer: Peer) {
  return peerToId(peer);
}

export function dialogPeerToDialogId(dialogPeer: DialogPeer) {
  if (dialogPeer._ === 'dialogPeerFolder') {
    return `folder_${dialogPeer.folder_id}`;
  }
  return peerToDialogId(dialogPeer.peer);
}

export function dialogIdToDialogPeer(id: string): DialogPeer {
  if (id.startsWith('folder_')) {
    return { _: 'dialogPeerFolder', folder_id: Number(id.slice(7)) };
  }
  return { _: 'dialogPeer', peer: peerIdToPeer(id) };
}

export function dialogToId(dialog: Readonly<Dialog>): string {
  if (dialog._ === 'dialogFolder') {
    return `folder_${dialog.folder.id}`;
  }
  return peerToDialogId(dialog.peer);
}

// Use it to convert a user message id to the message cache key
export function getUserMessageId(messageId: number): string {
  return `users_${messageId}`;
}

export function peerMessageToId(peer: Peer, messageId: number): string {
  if (peer._ === 'peerUser' || peer._ === 'peerChat') {
    // All the dialogs with user share a single messages counter
    return getUserMessageId(messageId);
  }
  return `${peerToId(peer)}_${messageId}`;
}

export function messageToDialogPeer(message: Readonly<Exclude<Message, Message.messageEmpty>>): Peer;
export function messageToDialogPeer(message: Readonly<Message.messageEmpty>): undefined;
export function messageToDialogPeer(message: Readonly<Message>): Peer | undefined;
export function messageToDialogPeer(message: Readonly<Message>): Peer | undefined {
  if (message._ === 'messageEmpty') return undefined;
  if (message.to_id._ === 'peerUser' && !message.out) return { _: 'peerUser', user_id: todoAssertHasValue(message.from_id) };
  return message.to_id;
}

export function messageToId(message: Readonly<Message>): string {
  if (message._ === 'messageEmpty') return `deleted_${message.id}`;
  return peerMessageToId(messageToDialogPeer(message), message.id);
}

export function messageIdToId(messageId: string) {
  const dividerPosition = messageId.lastIndexOf('_');
  return Number(messageId.slice(dividerPosition + 1));
}

/**
 * @return
 * <0 The first message is older than the second
 * =0 Messages are the same
 * >0 The first message is newer than the second
 */
export function compareSamePeerMessageIds(id1: string, id2: string): number {
  if (id1 === id2) {
    return 0;
  }
  if (id1.length !== id2.length) {
    return id1.length - id2.length;
  }
  return id1 < id2 ? -1 : 1;
}

export function userIdToPeer(id: number): Peer.peerUser {
  return { _: 'peerUser', user_id: id };
}

export function chatIdToPeer(id: number): Peer.peerChat {
  return { _: 'peerChat', chat_id: id };
}

export function channelIdToPeer(id: number): Peer.peerChannel {
  return { _: 'peerChannel', channel_id: id };
}

export function shortMessageToMessage(self: number, message: Updates.updateShortMessage): Message {
  return {
    ...message,
    _: 'message',
    from_id: message.out ? self : message.user_id,
    to_id: {
      _: 'peerUser',
      user_id: message.user_id,
    },
    media: { _: 'messageMediaEmpty' },
    entities: [],
  };
}

export function shortChatMessageToMessage(message: Updates.updateShortChatMessage): Message {
  const peer: Peer = {
    _: 'peerChat',
    chat_id: message.chat_id,
  };

  return {
    ...message,
    _: 'message',
    to_id: peer,
    media: { _: 'messageMediaEmpty' },
  };
}

export function isDialogInFolder(dialog: Readonly<Dialog>, folderId: number | undefined): boolean {
  if (!folderId) {
    return dialog._ !== 'dialog' || !dialog.folder_id;
  }
  return dialog._ === 'dialog' && dialog.folder_id === folderId;
}

export function getDialogLastReadMessageId(dialog: Dialog.dialog) {
  // Not perfect but suitable for most cases
  return dialog.unread_count > 0 ? dialog.read_inbox_max_id : dialog.top_message;
}

export function arePeersSame(peer1: Readonly<Peer> | null | undefined, peer2: Readonly<Peer> | null | undefined) {
  return (!!peer1 && peerToId(peer1)) === (!!peer2 && peerToId(peer2));
}

export function areUserStatusesEqual(status1: UserStatus | undefined, status2: UserStatus | undefined): boolean {
  if (status1 === status2) {
    return true;
  }
  if (status1 === undefined || status2 === undefined) {
    return false;
  }
  if (status1._ !== status2._) {
    return false;
  }
  switch (status1._) {
    case 'userStatusOnline': return status1.expires === (status2 as typeof status1).expires;
    case 'userStatusOffline': return status1.was_online === (status2 as typeof status1).was_online;
    default: return true;
  }
}

export function isSelf(peer: Peer) {
  return peer._ === 'peerUser' && peer.user_id === client.getUserID();
}

export function inputPeerToPeer(peer: InputPeer): Peer | null {
  switch (peer._) {
    case 'inputPeerChat':
      return { _: 'peerChat', chat_id: peer.chat_id };
    case 'inputPeerUser':
    case 'inputPeerUserFromMessage':
      return { _: 'peerUser', user_id: peer.user_id };
    case 'inputPeerChannel':
    case 'inputPeerChannelFromMessage':
      return { _: 'peerChannel', channel_id: peer.channel_id };
    case 'inputPeerSelf':
      return { _: 'peerUser', user_id: client.getUserID() };
    default:
      return null;
  }
}

export function inputPeerToInputDialogPeer(inputPeer: InputPeer): InputDialogPeer.inputDialogPeer {
  return {
    _: 'inputDialogPeer',
    peer: inputPeer,
  };
}

export function peerToDialogPeer(peer: Peer): DialogPeer {
  return {
    _: 'dialogPeer',
    peer,
  };
}

export function isDialogUnread(dialog: Dialog): boolean {
  if (dialog._ === 'dialog') {
    return dialog.unread_count > 0 || !!dialog.unread_mark;
  }
  return dialog.unread_muted_peers_count > 0 || dialog.unread_unmuted_peers_count > 0;
}

export function isDialogMuted(dialog: Dialog): boolean {
  if (dialog._ !== 'dialog') {
    return false;
  }
  return dialog.notify_settings && dialog.notify_settings.mute_until! > 0;
}

export function dialogIdToPeer(id: string): Peer | null {
  const dialogPeer = dialogIdToDialogPeer(id);
  if (dialogPeer._ === 'dialogPeer') {
    return dialogPeer.peer;
  }
  return null;
}

export function getMessageDocument(message: Readonly<Message>): Document.document | undefined {
  if (message._ !== 'message') return undefined;
  if (message.media?._ !== 'messageMediaDocument') return undefined;
  if (message.media.document?._ !== 'document') return undefined;
  return message.media.document;
}

export function inputPeerToInputUser(inputPeer: InputPeer): InputUser | null {
  switch (inputPeer._) {
    case 'inputPeerSelf': return { _: 'inputUserSelf' };
    case 'inputPeerUser': return { ...inputPeer, _: 'inputUser' };
    case 'inputPeerUserFromMessage': return { ...inputPeer, _: 'inputUserFromMessage' };
    default: return null;
  }
}

export function inputPeerToInputChannel(inputPeer: InputPeer): InputChannel | null {
  switch (inputPeer._) {
    case 'inputPeerChannel': return { ...inputPeer, _: 'inputChannel' };
    case 'inputPeerChannelFromMessage': return { ...inputPeer, _: 'inputChannelFromMessage' };
    default: return null;
  }
}
