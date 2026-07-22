import { redis } from "../db/redis.js";

export const CHUNK_TTL_SECONDS = 24 * 60 * 60;

export type StoredChunk = {
  chunkIndex: number;
  checksum: string | null;
};

const chunkKey = (uploadId: string) => `upload:chunks:${uploadId}`;

export const addChunk = async (
  uploadId: string,
  chunkIndex: number,
  checksum: string | null,
) => {
  const key = chunkKey(uploadId);
  await redis.hset(key, String(chunkIndex), checksum ?? "");
  await redis.expire(key, CHUNK_TTL_SECONDS);
};

export const getChunk = async (
  uploadId: string,
  chunkIndex: number,
): Promise<string | null> => {
  const key = chunkKey(uploadId);
  return redis.hget(key, String(chunkIndex));
};

export const getAllChunkIndices = async (
  uploadId: string,
): Promise<number[]> => {
  const key = chunkKey(uploadId);
  const fields = await redis.hkeys(key);
  return fields.map((field) => Number(field));
};

export const getAllChunks = async (
  uploadId: string,
): Promise<StoredChunk[]> => {
  const key = chunkKey(uploadId);
  const record = await redis.hgetall(key);
  return Object.entries(record).map(([chunkIndex, checksum]) => ({
    chunkIndex: Number(chunkIndex),
    checksum: checksum || null,
  }));
};

export const deleteChunkFields = async (
  uploadId: string,
  indices: number[],
) => {
  if (indices.length === 0) return;
  const key = chunkKey(uploadId);

  await redis.hdel(key, ...indices.map(String));
};

export const deleteAllChunks = async (uploadId: string) => {
  const key = chunkKey(uploadId);

  await redis.del(key);
};
