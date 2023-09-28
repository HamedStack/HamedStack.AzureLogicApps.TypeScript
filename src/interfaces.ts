import { WorkflowRun, WorkflowRunAction, WorkflowRunTrigger } from "@azure/arm-logic";
import { Json } from "./types";

export interface AzureAccountInfo {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    subscriptionId: string;
    apiVersion?: string;
}

export interface AzureWorkflowInfo {
    resourceGroup: string;
    workflowName: string;
}

export interface AzureTriggerInfo extends AzureWorkflowInfo {
    triggerName: string;
}

export interface HttpRequestResult {
    workflowRun: WorkflowRun,
    response: Json
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


export interface AzureTriggerData {
    name: string | undefined;
    input: Json | undefined;
    output: Json | undefined;
    trigger: WorkflowRunTrigger | undefined;
    isSuccessful: boolean;
    status: string | undefined;
}

export interface AzureWorkflowDetail {
    trigger: AzureTriggerData;
    actions: AzureWorkflowRunActionData[];
    workflowRun: WorkflowRun;
}

export interface AzureWorkflowDetailItemResult {
    isSuccessful: boolean;
    type: "WorkflowRun" | "Action" | "Trigger";
    object: AzureTriggerData | AzureWorkflowRunActionData | WorkflowRun
}

export interface AzureWorkflowDetailResult {
    isSuccessful: boolean;
    details: AzureWorkflowDetailItemResult[];
    errors: string[] | undefined;
}