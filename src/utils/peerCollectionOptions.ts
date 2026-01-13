import {
  type CollectionConfig,
  type DeleteMutationFnParams,
  type InsertMutationFnParams,
  InvalidStorageDataFormatError,
  InvalidStorageObjectFormatError,
  type ResolveType,
  SerializationError,
  StorageKeyRequiredError,
  type SyncConfig,
  type UpdateMutationFnParams,
  type UtilsRecord,
} from "@tanstack/db";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import localforage from "localforage";
import type { AnySchema } from "valibot";

/**
 * Storage API interface - subset of DOM Storage that we need
 */
// StorageApi and StorageEventApi are not used with localforage

/**
 * Internal storage format that includes version tracking
 */
interface StoredItem<T> {
  versionKey: string;
  data: T;
}

/**
 * Configuration interface for localStorage collection options
 * @template TExplicit - The explicit type of items in the collection (highest priority)
 * @template TSchema - The schema type for validation and type inference (second priority)
 * @template TFallback - The fallback type if no explicit or schema type is provided
 *
 * @remarks
 * Type resolution follows a priority order:
 * 1. If you provide an explicit type via generic parameter, it will be used
 * 2. If no explicit type is provided but a schema is, the schema's output type will be inferred
 * 3. If neither explicit type nor schema is provided, the fallback type will be used
 *
 * You should provide EITHER an explicit type OR a schema, but not both, as they would conflict.
 */
export interface LocalStorageCollectionConfig<
  TExplicit = unknown,
  TSchema extends StandardSchemaV1 = never,
  TFallback extends object = Record<string, unknown>,
> {
  /**
   * The key to use for storing the collection data in localStorage/sessionStorage
   */
  storageKey: string;
  /**
   * Collection identifier (defaults to "local-collection:{storageKey}" if not provided)
   */
  id?: string;
  schema?: TSchema;
  getKey: CollectionConfig<
    ResolveType<TExplicit, TSchema, TFallback>
  >["getKey"];
  sync?: CollectionConfig<ResolveType<TExplicit, TSchema, TFallback>>[`sync`];

  /**
   * Optional asynchronous handler function called before an insert operation
   * @param params Object containing transaction and collection information
   * @returns Promise resolving to any value
   */
  onInsert?: (
    params: InsertMutationFnParams<ResolveType<TExplicit, TSchema, TFallback>>,
  ) => Promise<any>;

  /**
   * Optional asynchronous handler function called before an update operation
   * @param params Object containing transaction and collection information
   * @returns Promise resolving to any value
   */
  onUpdate?: (
    params: UpdateMutationFnParams<ResolveType<TExplicit, TSchema, TFallback>>,
  ) => Promise<any>;

  /**
   * Optional asynchronous handler function called before a delete operation
   * @param params Object containing transaction and collection information
   * @returns Promise resolving to any value
   */
  onDelete?: (
    params: DeleteMutationFnParams<ResolveType<TExplicit, TSchema, TFallback>>,
  ) => Promise<any>;
}

/**
 * Type for the clear utility function
 */
export type ClearStorageFn = () => void;

/**
 * Type for the getStorageSize utility function
 */
export type GetStorageSizeFn = () => number;

/**
 * LocalStorage collection utilities type
 */
export interface LocalStorageCollectionUtils extends UtilsRecord {
  clearStorage: () => Promise<void>;
  getStorageSize: () => Promise<number>;
}

/**
 * Validates that a value can be JSON serialized
 * @param value - The value to validate for JSON serialization
 * @param operation - The operation type being performed (for error messages)
 * @throws Error if the value cannot be JSON serialized
 */
function validateJsonSerializable(value: any, operation: string): void {
  try {
    JSON.stringify(value);
  } catch (error) {
    throw new SerializationError(
      operation,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Generate a UUID for version tracking
 * @returns A unique identifier string for tracking data versions
 */
function generateUuid(): string {
  return crypto.randomUUID();
}

/**
 * Creates localStorage collection options for use with a standard Collection
 *
 * This function creates a collection that persists data to localStorage/sessionStorage
 * and synchronizes changes across browser tabs using storage events.
 *
 * @template TExplicit - The explicit type of items in the collection (highest priority)
 * @template TSchema - The schema type for validation and type inference (second priority)
 * @template TFallback - The fallback type if no explicit or schema type is provided
 * @param config - Configuration options for the localStorage collection
 * @returns Collection options with utilities including clearStorage and getStorageSize
 *
 * @example
 * // Basic localStorage collection
 * const collection = createCollection(
 *   localStorageCollectionOptions({
 *     storageKey: 'todos',
 *     getKey: (item) => item.id,
 *   })
 * )
 *
 * @example
 * // localStorage collection with custom storage
 * const collection = createCollection(
 *   localStorageCollectionOptions({
 *     storageKey: 'todos',
 *     storage: window.sessionStorage, // Use sessionStorage instead
 *     getKey: (item) => item.id,
 *   })
 * )
 *
 * @example
 * // localStorage collection with mutation handlers
 * const collection = createCollection(
 *   localStorageCollectionOptions({
 *     storageKey: 'todos',
 *     getKey: (item) => item.id,
 *     onInsert: async ({ transaction }) => {
 *       console.log('Item inserted:', transaction.mutations[0].modified)
 *     },
 *   })
 * )
 */
export function localStorageCollectionOptions<
  TExplicit = unknown,
  TSchema extends StandardSchemaV1 = never,
  TFallback extends object = Record<string, unknown>,
>(
  config: LocalStorageCollectionConfig<TExplicit, TSchema, TFallback>,
): Omit<CollectionConfig<ResolveType<TExplicit, TSchema, TFallback>>, "id" | "sync"> & {
  id: string;
  sync?: SyncConfig<ResolveType<TExplicit, TSchema, TFallback>, string | number>;
  utils: LocalStorageCollectionUtils;
} {
  type ResolvedType = ResolveType<TExplicit, TSchema, TFallback>;

  if (!config.storageKey) {
    throw new StorageKeyRequiredError();
  }

  // Use localforage instance for this collection
  const lf = localforage.createInstance({
    name: config.storageKey,
  });

  // Track the last known state to detect changes
  const lastKnownData = new Map<string | number, StoredItem<ResolvedType>>();

  // Save all items (Map) to indexeddb
  const saveToStorage = async (
    dataMap: Map<string | number, StoredItem<ResolvedType>>,
  ) => {
    await lf.clear();
    for (const [key, value] of dataMap.entries()) {
      await lf.setItem(String(key), value);
    }
  };

  // Load all items from indexeddb as Map
  const loadFromStorage = async (): Promise<
    Map<string | number, StoredItem<ResolvedType>>
  > => {
    const map = new Map<string | number, StoredItem<ResolvedType>>();
    await lf.iterate((value, key) => {
      map.set(key, value as StoredItem<ResolvedType>);
    });
    return map;
  };

  // Removes all collection data from the configured storage
  const clearStorage = async (): Promise<void> => {
    await lf.clear();
  };

  // Get the size of the stored data in bytes (approximate)
  const getStorageSize = async (): Promise<number> => {
    let size = 0;
    await lf.iterate((value) => {
      size += new Blob([JSON.stringify(value)]).size;
    });
    return size;
  };

  /*
   * Create wrapper handlers for direct persistence operations that perform actual storage operations
   * Wraps the user's onInsert handler to also save changes to localStorage
   */
  const wrappedOnInsert = async (
    params: InsertMutationFnParams<ResolvedType>,
  ) => {
    params.transaction.mutations.forEach(
      (mutation) => {
        validateJsonSerializable(mutation.modified, `insert`);
      },
    );
    let handlerResult: any = {};
    if (config.onInsert) {
      handlerResult = (await config.onInsert(params)) ?? {};
    }
    // Always persist to storage
    const currentData = await loadFromStorage();
    params.transaction.mutations.forEach(
      (mutation) => {
        const key = config.getKey(mutation.modified);
        const storedItem: StoredItem<ResolvedType> = {
          versionKey: generateUuid(),
          data: mutation.modified,
        };
        currentData.set(key, storedItem);
      },
    );
    await saveToStorage(currentData);
    return handlerResult;
  };

  const wrappedOnUpdate = async (
    params: UpdateMutationFnParams<ResolvedType>,
  ) => {
    params.transaction.mutations.forEach(
      (mutation) => {
        validateJsonSerializable(mutation.modified, `update`);
      },
    );
    let handlerResult: any = {};
    if (config.onUpdate) {
      handlerResult = (await config.onUpdate(params)) ?? {};
    }
    // Always persist to storage
    const currentData = await loadFromStorage();
    params.transaction.mutations.forEach(
      (mutation) => {
        const key = config.getKey(mutation.modified);
        const storedItem: StoredItem<ResolvedType> = {
          versionKey: generateUuid(),
          data: mutation.modified,
        };
        currentData.set(key, storedItem);
      },
    );
    await saveToStorage(currentData);
    return handlerResult;
  };

  const wrappedOnDelete = async (
    params: DeleteMutationFnParams<ResolvedType>,
  ) => {
    let handlerResult: any = {};
    if (config.onDelete) {
      handlerResult = (await config.onDelete(params)) ?? {};
    }
    // Always persist to storage
    const currentData = await loadFromStorage();
    params.transaction.mutations.forEach(
      (mutation) => {
        const key = config.getKey(mutation.original as ResolvedType);
        currentData.delete(key);
      },
    );
    await saveToStorage(currentData);
    return handlerResult;
  };

  // Extract standard Collection config properties
  const { storageKey: _storageKey, id, sync, onInsert, onUpdate, onDelete, ...restConfig } = config;

  const collectionId = id ?? `local-collection:${config.storageKey}`;

  return {
    ...restConfig,
    id: collectionId,
    ...(sync && { sync }),
    onInsert: wrappedOnInsert,
    onUpdate: wrappedOnUpdate,
    onDelete: wrappedOnDelete,
    utils: {
      clearStorage,
      getStorageSize,
    },
  };
}

// loadFromStorage is now async and inlined above

// createLocalStorageSync is not used with localforage
