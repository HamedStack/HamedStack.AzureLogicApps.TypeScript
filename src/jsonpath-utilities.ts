import { JSONPath } from "jsonpath-plus";

export function findValueByJsonPath(path: string, json: any): any[] {
    let clonedJson = {};
    if (typeof json === "string" || json instanceof String) {
        clonedJson = JSON.parse(<string>json);
    } else {
        clonedJson = { ...json as any };
    }
    const result = JSONPath({ path, json: clonedJson });
    return result as any[];
}
