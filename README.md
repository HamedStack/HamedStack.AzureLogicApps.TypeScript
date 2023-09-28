# HamedStack.AzureLogicApps.TypeScript

A library to access all details of a workflow run with executing JSONPath query on the details.

## Usage

You have access to the following APIs.

### Login

By using this API you can login and fetch the workflow details.

```ts
let alam = new AzureLogicAppsManagement(
  /*AzureAccountInfo*/
  {
    // Your Azure security info
    clientId: "",
    clientSecret: "",
    subscriptionId: "",
    tenantId: "",
  }
);
```

```ts
export interface AzureAccountInfo {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    subscriptionId: string;
    apiVersion?: string;
}
```

### Workflow Detail

By call it you will get all information of most recent workflow run of your workflow.

```ts
AzureWorkflowDetail details = await alam.getLastWorkflowDetail(
    /*(azureWorkflowInfo: AzureWorkflowInfo, actionsFilter: "input" | "output" | "both" = "both"): Promise<AzureWorkflowDetail | undefined>*/
    {
        // Available via Azure Portal
        workflowName: '',
        resourceGroup: '',
    });
```

it returns

```ts
export interface AzureWorkflowDetail {
    trigger: AzureTriggerData;
    actions: AzureWorkflowRunActionData[];
    workflowRun: WorkflowRun;
}
export interface AzureTriggerData {
    name: string | undefined;
    input: Json | undefined;
    output: Json | undefined;
    trigger: WorkflowRunTrigger | undefined;
    isSuccessful: boolean;
    status: string | undefined;
}
export interface AzureWorkflowRunActionData {
    order: number,
    name: string;
    input?: Json | undefined;
    output?: Json | undefined;
    action?: WorkflowRunAction;
    status: string | undefined;
    parents?: string[];
    isSuccessful: boolean;
}
```

### Query Execution

```ts
// Returns any
const result = await alam.executeQueryOnWorkflowDetail(
  /* (AzureWorkflowDetail, string | undefined, JsonPathQuerySection, string): Promise<any[] | undefined> */

  details, // Workflow details

  // Action name, trigger name or undefind for WorkflowRun
  // Same name of Azure Logic App UI but with underscore instead of whitespace.
  "Initialize_variable_2",

  // Query on Action, ActionInput, ActionOutput, Trigger, TriggerInput, TriggerOutput, WorkflowRun
  // Items of Workflow details object.
  JsonPathQuerySection.ActionInput,

  "$..value" // JSONPath
);
```

### Get First Match

This method find first match workflow among all available workflows based on conditions.

```ts
WorkflowRun wf = await alam.findWorkflowRunOnFirstMatch({
    /* (AzureWorkflowInfo, string | undefined, string, conditions: ((v: any) => boolean)[], filter?: string, top?: number): Promise<WorkflowRun | undefined>*/
    workflowName: '...',
    resourceGroup: '...'
  }, "Initialize_variable", // Action Name
    "$..value", // Json path inside your Input Action
    [x => x == ?], // array of conditions to match (if one of them matches you will get result)
    undefined // filter you can pass
    undefined // top option
    );
```

```ts
getWorkflowRunOnFirstMatch(azureWorkflowInfo: AzureWorkflowInfo, workflowRuns: WorkflowRun[], inputActionName: string | undefined, jsonPath: string, conditions: ((v: any) => boolean)[]): Promise<WorkflowRun | undefined>
```

Same as `findWorkflowRunOnFirstMatch` but accepts `workflowRuns` as a parameter to check your in-memory object.

### Analysis the workflow run

```ts
analysisAzureWorkflowDetail(azureWorkflowDetail: AzureWorkflowDetail): AzureWorkflowDetailResult
```

To analysis and get report from an `AzureWorkflowDetail` you should use it.

```ts
export interface AzureWorkflowDetailResult {
    isSuccessful: boolean; //overal status
    details: AzureWorkflowDetailItemResult[];
    errors: string[] | undefined; // error messages
}
export interface AzureWorkflowDetailItemResult {
    isSuccessful: boolean;
    type: "WorkflowRun" | "Action" | "Trigger";
    object: AzureTriggerData | AzureWorkflowRunActionData | WorkflowRun
}
```


## Sample

```ts
import {
  AzureLogicAppsManagement,
  AzureWorkflowDetail,
  JsonPathQuerySection,
} from "@hamedstack/azure-logic-apps";

let alam: AzureLogicAppManagement;
let details: AzureWorkflowDetails;
describe("Sample", () => {
  beforeAll(async () => {
    alam = new AzureLogicAppsManagement({
      clientId: "...",
      clientSecret: "...",
      subscriptionId: "...",
      tenantId: "...",
    });

    detail = await alam.getLastWorkflowDetail({
      workflowName: "my-wf",
      resourceGroup: "rg-testing",
    });
  });
  it("getting data from Logic App", async () => {

    // Always returns an array
    const result = await alam.executeQueryOnWorkflowDetail(
      detail,
      "Initialize_variable_2" /* or 'Initialize variable 2' */,
      JsonPathQuerySection.ActionInput,
      "$..value"
    );

    const report = alam.analysisAzureWorkflowDetail(detail);
    
    // Checking overal status
    expect(report.isSuccessful).toEqual(true);

    // Checking details
    expect(result[0]).toEqual(3); // value should be 3
  });
});
```
