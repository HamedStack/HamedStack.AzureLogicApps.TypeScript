export interface JsonObject {
    [member: string]: string | number | boolean | null | JsonArray | JsonObject;
  }
  export type JsonArray = Array<
    string | number | boolean | null | JsonArray | JsonObject
  >;
  export type Json = JsonObject | JsonArray | string | number | boolean | null;