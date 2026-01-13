import * as v from "valibot";

import { err, ok, safeTry } from "neverthrow";
import { safeFetch } from "./safeFetch";

export const storageEaterySchema = v.object({
  id: v.string(),
  name: v.string(),
  updatedAt: v.number(),
  _deleted: v.optional(v.boolean()),
});

export const storageUserSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.nullable(v.pipe(v.string(), v.email())),
  updatedAt: v.number(),
  _deleted: v.optional(v.boolean()),
});

export const storageEateryScoreSchema = v.object({
  userId: v.string(),
  eateryId: v.string(),
  score: v.number(),
  updatedAt: v.number(),
  _deleted: v.optional(v.boolean()),
});

export const storageSchema = v.object({
  id: v.string(),
  settings: v.object({
    connection: v.object({
      name: v.string(),
      updatedAt: v.number(),
    }),
    eateries: v.array(storageEaterySchema),
    users: v.array(storageUserSchema),
    eateryScores: v.array(storageEateryScoreSchema),
  }),
});

// TODO share json here
// https://jsonblob.com/api
// TODO how to implement sharing? If we deploy to vercel, there is no way to have websockets. what are other options? So scanning QR code on mobile from TV dashboard would not work.
// How to get the TV to know that mobile has scanned and synchronized data, or updated with new data.
// I want to be able to scan QR code on mobile browser, from a dashboard on big TV. this would allow to open same wheel on mobile that is on tv.
// User on mobile would make changes, and they would eventually show up on tv. Storage data is too much to fit into QR code directly

export type StorageSchemaType = v.InferInput<typeof storageSchema>;

function getStorageId(connectionId: string) {
  return `wte-${connectionId}`;
}

async function getSettingsFromStorage(connectionId: string) {
  const result = await safeFetch(
    `https://json.extendsclass.com/bin/${getStorageId(connectionId)}`
  );
  return result.map((r) => {
    const parsed = v.safeParse(storageSchema, r);
    if (!parsed.success)
      return err({
        type: "schema-error",
        error: v.flatten(parsed.issues),
      } as const);
    return ok(parsed.output);
  });
}

async function updateUserSettings() {
  // TODO fetch existing schema, merge with provided user settings;
  // PATCH result
}

async function addEateryToList() {
  // TODO
}

// TODO, work out something stable enough that would be possible to use with multiple people.
// addEatery

// TODO synchronize actions? Like clicking spin wheel, to show on other devices? Do we need this feature?
// That would require constant pinging on the storage. 10000 requests per month limit...

// const a = await safeTry(async function* () {
//   const res = yield* safeFetch(
//     `https://json.extendsclass.com/bin/${getStorageId(connectionId)}`
//   );

//   return res;
// });
