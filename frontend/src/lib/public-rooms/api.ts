import { getUrl } from "$lib";

export interface PublicRoomInfo {
  id: string;
  name: string;
  auth: boolean;
  tags: string[];
  pieces: number;
  rotation: boolean;
  nsfw: boolean;
  players: number;
  completion: number;
  sets: number;
  hostName?: string;
  startTime?: Date;
  thumbnail?: string;
  hidePreview?: boolean;
  hasVideo?: boolean;
  jigChan?: boolean;
  gay?: boolean;
}

export const getPublicRooms = async (
  key?: string
): Promise<PublicRoomInfo[]> => {
  try {
    let url = getUrl("/api/search");
    if (key) {
      url += `?key=${key}`;
    }
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error(error);
  }

  return [];
};
