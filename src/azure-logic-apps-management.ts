import { LogicManagementClient, Workflow, WorkflowRun } from "@azure/arm-logic";
import { ClientSecretCredential } from "@azure/identity";
import { AzureWorkflowRunStatus, JsonPathQuerySection } from "./enums";
import { getHttpRequest, postHttpRequest } from "./fetch-utilities";
import { AzureAccountInfo, HttpRequestResult, AzureWorkflowInfo, AzureTriggerData, AzureTriggerInfo, AzureWorkflowDetail, AzureWorkflowRunActionData, AzureWorkflowDetailResult, AzureWorkflowDetailItemResult } from "./interfaces";
import { findValueByJsonPath } from "./jsonpath-utilities";
import { Json } from "./types";
import { groupBy } from "./utilities";

export class AzureLogicAppsManagement {
    private _client: LogicManagementClient;

    constructor(private azureAccountInfo: AzureAccountInfo) {
        const credential = new ClientSecretCredential(
            azureAccountInfo.tenantId,
            azureAccountInfo.clientId,
            azureAccountInfo.clientSecret
        );
        this._client = new LogicManagementClient(
            credential,
            azureAccountInfo.subscriptionId,
            {
                apiVersion: azureAccountInfo.apiVersion || "2016-06-01",
            }
        );
    }

    public async getAccessToken(): Promise<string> {
        const credential = new ClientSecretCredential(
            this.azureAccountInfo.tenantId,
            this.azureAccountInfo.clientId,
            this.azureAccountInfo.clientSecret
        );
        const result = await credential.getToken(`api://${this.azureAccountInfo.clientId}/.default`);
        return result.token;
    }

    public async callHttpRequestTrigger(azureTriggerInfo: AzureTriggerInfo, data?: Json): Promise<HttpRequestResult | undefined> {
        const result = await this._client.workflowTriggers.listCallbackUrl(
            azureTriggerInfo.resourceGroup,
            azureTriggerInfo.workflowName,
            azureTriggerInfo.triggerName
        );
        if (result && result.value) {
            const response = await postHttpRequest(result.value, data);
            const json = await response.json();
            const workflowrunName = response.headers.get("x-ms-workflow-run-id");
            if (workflowrunName) {
                const workflowRuns = await this.getWorkflowRunsByName({
                    resourceGroup: azureTriggerInfo.resourceGroup,
                    workflowName: azureTriggerInfo.workflowName
                }, workflowrunName);
                if (workflowRuns && workflowRuns.length > 0) {
                    return {
                        response: json as Json,
                        workflowRun: workflowRuns[0]
                    }
                }
            }
        }
    }
    private async getWorkflowTrigger(workflowRun: WorkflowRun, filter: "input" | "output" | "both" = "both"): Promise<AzureTriggerData> {
        let inputResult: Json | undefined = undefined;
        let outputResult: Json | undefined = undefined;
        const inputUri = workflowRun.trigger?.inputsLink?.uri;
        if (inputUri && (filter == "input" || filter == "both")) {
            inputResult = await (await getHttpRequest(inputUri)).json() as Json;
        }
        const outputUri = workflowRun.trigger?.outputsLink?.uri;
        if (outputUri && (filter == "input" || filter == "both")) {
            outputResult = await (await getHttpRequest(outputUri)).json() as Json;
        }
        return {
            name: workflowRun.trigger?.name,
            input: inputResult,
            output: outputResult,
            trigger: workflowRun.trigger,
            status: workflowRun.trigger?.status,
            isSuccessful: workflowRun.trigger?.status?.toLowerCase() == "succeeded"
        }

    }
    public async getLastWorkflowDetail(azureWorkflowInfo: AzureWorkflowInfo, actionsFilter: "input" | "output" | "both" = "both"): Promise<AzureWorkflowDetail | undefined> {
        const topWorkflowRun = (await this.getLastWorkflowRun(azureWorkflowInfo));
        const actions = await this.getWorkflowActions(topWorkflowRun, azureWorkflowInfo, actionsFilter);
        const trigger = await this.getWorkflowTrigger(topWorkflowRun);
        if (topWorkflowRun && actions && trigger) {
            const result: AzureWorkflowDetail = {
                actions: this.sortAzureWorkflowRunActionInfoByStartTime(actions),
                trigger: trigger,
                workflowRun: topWorkflowRun,
            }
            return result;
        }
    }
    public async getWorkflowDetailByName(azureWorkflowInfo: AzureWorkflowInfo, clientTrackingId: string, actionsFilter: "input" | "output" | "both" = "both"): Promise<AzureWorkflowDetail | undefined> {
        const workflowRun = await this._client.workflowRuns.get(azureWorkflowInfo.resourceGroup, azureWorkflowInfo.workflowName, clientTrackingId);
        const actions = await this.getWorkflowActions(workflowRun, azureWorkflowInfo, actionsFilter);
        const trigger = await this.getWorkflowTrigger(workflowRun);
        if (workflowRun && actions && trigger) {
            const result: AzureWorkflowDetail = {
                actions: this.sortAzureWorkflowRunActionInfoByStartTime(actions),
                trigger: trigger,
                workflowRun: workflowRun,
            }
            return result;
        }
    }
    public async findWorkflowDetailOnFirstMatch(azureWorkflowInfo: AzureWorkflowInfo, inputActionName: string | undefined, jsonPath: string, conditions: ((v: any) => boolean)[], filter?: string, top?: number): Promise<AzureWorkflowDetail | undefined> {
        const workflowRun = await this.findWorkflowRunOnFirstMatch(azureWorkflowInfo, inputActionName, jsonPath, conditions, filter, top);
        if (workflowRun) {
            const actions = await this.getWorkflowActions(workflowRun, azureWorkflowInfo);
            const trigger = await this.getWorkflowTrigger(workflowRun);
            if (actions) {
                const result: AzureWorkflowDetail = {
                    actions: this.sortAzureWorkflowRunActionInfoByStartTime(actions),
                    trigger: trigger,
                    workflowRun: workflowRun,
                }
                return result;
            }
        }
    }

    public analysisAzureWorkflowDetail(azureWorkflowDetail: AzureWorkflowDetail, succeededCondition?: (checkFor: "WorkflowRun" | "Trigger" | "Action", status: string | undefined) => boolean): AzureWorkflowDetailResult {
        const errorMessages: string[] = [];
        const azureWorkflowDetailItemResult: AzureWorkflowDetailItemResult[] = [];
        const isWorkflowRunSucceeded = succeededCondition ? succeededCondition("WorkflowRun", azureWorkflowDetail.workflowRun.status?.toLowerCase()) : azureWorkflowDetail.workflowRun.status?.toLowerCase() == "succeeded";
        const isTriggerSucceeded = succeededCondition ? succeededCondition("Trigger", azureWorkflowDetail.workflowRun.status?.toLowerCase()) : azureWorkflowDetail.trigger.isSuccessful;
        azureWorkflowDetailItemResult.push({
            isSuccessful: isWorkflowRunSucceeded,
            object: azureWorkflowDetail.workflowRun,
            type: "WorkflowRun"
        });
        if (!isWorkflowRunSucceeded) {
            errorMessages.push(`The workflow run with name of '${this.getWorkflowRunName(azureWorkflowDetail.workflowRun)}' is ${azureWorkflowDetail.workflowRun.status?.toLowerCase()}.`);
        }

        azureWorkflowDetailItemResult.push({
            isSuccessful: isTriggerSucceeded,
            object: azureWorkflowDetail.trigger,
            type: "Trigger"
        });
        if (!isTriggerSucceeded) {
            errorMessages.push(`The trigger with the name of '${azureWorkflowDetail.trigger.name}' is ${azureWorkflowDetail.workflowRun.status?.toLowerCase()}. `);
        }
        azureWorkflowDetail.actions = this.sortAzureWorkflowRunActionInfoByStartTimeAndParents(azureWorkflowDetail.actions);
        for (let index = 0; index < azureWorkflowDetail.actions.length; index++) {
            const action = azureWorkflowDetail.actions[index];
            const isActionSucceeded = succeededCondition ? succeededCondition("Action", action.status?.toLowerCase()) : action.isSuccessful;
            azureWorkflowDetailItemResult.push({
                isSuccessful: isActionSucceeded,
                object: action,
                type: "Action"
            });
            if (!isActionSucceeded) {
                let parentMessage = "This action has no parent. ";
                const grouped = groupBy(azureWorkflowDetail.actions, x => {
                    if (x.parents) {
                        return x.parents.reduce((a, b) => a + "." + b);
                    } else {
                        return ".";
                    }
                });
                if (action.parents && action.parents.length > 0) {
                    parentMessage = "The parent of this action is '" + action.parents.reduce((a, b) => a + "." + b) + "'. ";
                }
                const children = [...grouped].filter(x => x[0] == action.name).flatMap(x => x[1]).map(x => x.name);
                if (children && children.length > 0) {
                    if (children.length == 1) {
                        parentMessage += `The child of this action is ${children[0]}. `
                    } else {
                        const childrenN = children.slice(0, children.length - 1);
                        parentMessage += `The children of this action are ${childrenN.reduce((a, b) => a + ", " + b)}, and ${children[children.length - 1]}. `
                    }
                }
                errorMessages.push(`The action with the name of '${action.name}' is ${azureWorkflowDetail.workflowRun.status?.toLowerCase()}. ${parentMessage}`.trim());
            }
        }
        const result: AzureWorkflowDetailResult = {
            isSuccessful: azureWorkflowDetailItemResult.map(v => v.isSuccessful).every(v => v === true),
            details: azureWorkflowDetailItemResult,
            errors: errorMessages.length == 0 ? undefined : errorMessages
        };

        return result;
    }


    public async getWorkflowDetailOnFirstMatch(azureWorkflowInfo: AzureWorkflowInfo, workflowRuns: WorkflowRun[], inputActionName: string | undefined, jsonPath: string, conditions: ((v: any) => boolean)[]): Promise<AzureWorkflowDetail | undefined> {
        const workflowRun = await this.getWorkflowRunOnFirstMatch(azureWorkflowInfo, workflowRuns, inputActionName, jsonPath, conditions);
        if (workflowRun) {
            const actions = await this.getWorkflowActions(workflowRun, azureWorkflowInfo);
            const trigger = await this.getWorkflowTrigger(workflowRun);
            if (actions) {
                const result: AzureWorkflowDetail = {
                    actions: this.sortAzureWorkflowRunActionInfoByStartTime(actions),
                    trigger: trigger,
                    workflowRun: workflowRun,
                }
                return result;
            }
        }
    }

    public getWorkflowRunName(workflowRun: WorkflowRun): string | undefined {
        return workflowRun.correlation?.clientTrackingId;
    }

    public async getWorkflowByName(
        azureWorkflowInfo: AzureWorkflowInfo
    ): Promise<Workflow> {
        const result = await this._client.workflows.get(
            azureWorkflowInfo.resourceGroup,
            azureWorkflowInfo.workflowName
        );
        return result;
    }

    public async executeQueryOnWorkflowDetail(azureWorkflowDetail: AzureWorkflowDetail, actionOrTriggerName: string | undefined,
        queryOn: JsonPathQuerySection, jsonPath: string): Promise<any[] | undefined> {
        if (actionOrTriggerName)
            actionOrTriggerName = actionOrTriggerName.indexOf(" ") >= 0 ? actionOrTriggerName.replace(/\s+/g, "_") : actionOrTriggerName;
        const data = azureWorkflowDetail.actions.filter(x => x.name == actionOrTriggerName);
        switch (queryOn) {
            case JsonPathQuerySection.ActionInput:
                if (data && data.length > 0 && data[0].input) {
                    return findValueByJsonPath(jsonPath, data[0].input);
                }
                break;
            case JsonPathQuerySection.ActionOutput:
                if (data && data.length > 0 && data[0].output) {
                    return findValueByJsonPath(jsonPath, data[0].output);
                }
                break;
            case JsonPathQuerySection.TriggerInput:
                if (azureWorkflowDetail.trigger.name == actionOrTriggerName && azureWorkflowDetail.trigger.input) {
                    return findValueByJsonPath(jsonPath, azureWorkflowDetail.trigger.input);
                }
                break;
            case JsonPathQuerySection.TriggerOutput:
                if (azureWorkflowDetail.trigger.name == actionOrTriggerName && azureWorkflowDetail.trigger.output) {
                    return findValueByJsonPath(jsonPath, azureWorkflowDetail.trigger.output);
                }
                break;
            case JsonPathQuerySection.WorkflowRun:
                if (azureWorkflowDetail.workflowRun) {
                    return findValueByJsonPath(jsonPath, azureWorkflowDetail.workflowRun);
                }
                break;
            case JsonPathQuerySection.Trigger:
                if (azureWorkflowDetail.trigger) {
                    return findValueByJsonPath(jsonPath, azureWorkflowDetail.trigger);
                }
                break;
            case JsonPathQuerySection.Action:
                if (data && data.length > 0 && data[0].action) {
                    return findValueByJsonPath(jsonPath, data[0].action);
                }
                break;
        }
        return undefined;
    }

    public async getLastWorkflowRun(azureWorkflowInfo: AzureWorkflowInfo, filter?: string | undefined): Promise<WorkflowRun> {
        return (await this.getWorkflowRuns(azureWorkflowInfo, filter, 1))[0];
    }

    public async findWorkflowRunOnFirstMatch(azureWorkflowInfo: AzureWorkflowInfo, inputActionName: string | undefined, jsonPath: string, conditions: ((v: any) => boolean)[], filter?: string, top?: number): Promise<WorkflowRun | undefined> {
        const workflowRuns = await this.getWorkflowRuns(azureWorkflowInfo, filter, top);
        if (inputActionName && inputActionName.trim().length > 0)
            inputActionName = inputActionName.replace(/\s+/g, "_");
        for (let index = 0; index < workflowRuns.length; index++) {
            const workflowInputActions = await this.getWorkflowActions(workflowRuns[index], azureWorkflowInfo, "input");
            if (workflowInputActions && workflowInputActions.length > 0) {
                const data = workflowInputActions.filter(x => x.name == inputActionName);
                if (data && data.length > 0 && data[0]) {
                    const value = findValueByJsonPath(jsonPath, data[0]);
                    for (const c of conditions) {
                        for (const v of value) {
                            if (c(v)) {
                                return workflowRuns[index];
                            }
                        }
                    }
                }
            }
        }
    }

    public async getWorkflowRunOnFirstMatch(azureWorkflowInfo: AzureWorkflowInfo, workflowRuns: WorkflowRun[], inputActionName: string | undefined, jsonPath: string, conditions: ((v: any) => boolean)[]): Promise<WorkflowRun | undefined> {
        if (inputActionName && inputActionName.trim().length > 0)
            inputActionName = inputActionName.replace(/\s+/g, "_");
        for (let index = 0; index < workflowRuns.length; index++) {
            const workflowInputActions = await this.getWorkflowActions(workflowRuns[index], azureWorkflowInfo, "input");
            if (workflowInputActions && workflowInputActions.length > 0) {
                const data = workflowInputActions.filter(x => x.name == inputActionName);
                if (data && data.length > 0 && data[0]) {
                    const value = findValueByJsonPath(jsonPath, data[0]);
                    for (const c of conditions) {
                        for (const v of value) {
                            if (c(v)) {
                                return workflowRuns[index];
                            }
                        }
                    }
                }
            }
        }
    }

    public async getWorkflowRuns(azureWorkflowInfo: AzureWorkflowInfo, filter?: string | undefined, top?: number | undefined): Promise<WorkflowRun[]> {
        const result = this._client.workflowRuns.list(
            azureWorkflowInfo.resourceGroup,
            azureWorkflowInfo.workflowName,
            {
                filter: filter,
                top: top
            }
        );
        const workflowRuns: WorkflowRun[] = [];
        for await (const page of result.byPage()) {
            for (const run of page) {
                workflowRuns.push(run);
            }
        }
        return workflowRuns;
    }

    public async getWorkflowRunsByName(azureWorkflowInfo: AzureWorkflowInfo, clientTrackingIdOrRunName: string, filter?: string | undefined, top?: number | undefined): Promise<WorkflowRun[]> {
        const runs = await this.getWorkflowRuns(azureWorkflowInfo, filter, top);
        const result: WorkflowRun[] = [];
        for (const run of runs) {
            if (clientTrackingIdOrRunName == this.getWorkflowRunName(run)) {
                result.push(run);
            }
        }
        return result;
    }

    public async getWorkflowRunsByStatus(workflowDataInfo: AzureWorkflowInfo, workflowStatus: AzureWorkflowRunStatus, filter?: string | undefined, top?: number | undefined): Promise<WorkflowRun[]> {
        if (!workflowDataInfo) {
            throw new Error("'workflowDataInfo' is undefined.");
        }
        const runs = await this.getWorkflowRuns(workflowDataInfo, filter, top);
        const result: WorkflowRun[] = [];
        for (const run of runs) {
            if (run.status && (run.status == workflowStatus)) {
                result.push(run);
            }
        }
        return result;
    }

    public async getWorkflowRunsByStartingDateTime(workflowDataInfo: AzureWorkflowInfo, date: Date, top?: number | undefined, operator: "ge" | "le" = "ge"): Promise<WorkflowRun[]> {
        const filter = `startTime ${operator} ${date.toISOString()}`;
        const runs = await this.getWorkflowRuns(workflowDataInfo, filter, top);
        return runs;
    }

    public async getWorkflowRunsByDateTime(workflowDataInfo: AzureWorkflowInfo, startDate: Date, endDate: Date, top?: number | undefined): Promise<WorkflowRun[]> {
        const filter1 = `startTime ge ${startDate.toISOString()}`;
        const filter2 = `startTime le ${endDate.toISOString()}`;
        const runs = await this.getWorkflowRuns(workflowDataInfo, `(${filter1}) and (${filter2})`, top);
        return runs;
    }

    public async getWorkflowActions(workflowRun: WorkflowRun, workflowDataInfo: AzureWorkflowInfo, actionsFilter: "input" | "output" | "both" = "both"): Promise<AzureWorkflowRunActionData[] | undefined> {
        const azureWorkflowRunActions: AzureWorkflowRunActionData[] = [];
        const workflowRunName = this.getWorkflowRunName(workflowRun);
        const stack: string[] = [];
        const parents: string[] = [];
        let parentCounter = 0;
        if (workflowRunName) {
            const workflow = await this.getWorkflowByName(workflowDataInfo);
            const actions = workflow.definition["actions"];
            const actionKeys = Object.keys(actions);
            actionKeys.forEach(action => {
                stack.push(action);
            });
            while (stack.length > 0) {
                const currentActionName = stack.pop();
                if (currentActionName) {
                    const workflowRunAction = await this._client.workflowRunActions.get(workflowDataInfo.resourceGroup, workflowDataInfo.workflowName, workflowRunName, currentActionName);
                    let inputResult: Json | undefined = undefined;
                    let outputResult: Json | undefined = undefined;
                    const inputUri = workflowRunAction.inputsLink?.uri;
                    const outputUri = workflowRunAction.outputsLink?.uri;
                    if (inputUri && (actionsFilter == "input" || actionsFilter == "both")) {
                        inputResult = await (await getHttpRequest(inputUri)).json();
                    }
                    if (outputUri && (actionsFilter == "output" || actionsFilter == "both")) {
                        outputResult = await (await getHttpRequest(outputUri)).json();
                    }
                    // Root
                    azureWorkflowRunActions.push({
                        order: workflowRunAction.startTime?.getTime() || 0,
                        name: currentActionName,
                        input: inputResult,
                        output: outputResult,
                        action: workflowRunAction,
                        status: workflowRunAction.status,
                        isSuccessful: workflowRunAction.status?.toLowerCase() == "succeeded",
                        parents: parents.length > 0 ? [...parents] : undefined
                    });

                    if (parentCounter > 0) {
                        --parentCounter;
                    }
                    if (parentCounter <= 0 && parents.length > 0) {
                        parents.pop();
                    }
                    const hasNestedActions = actions && actions[currentActionName] && actions[currentActionName]["actions"] != undefined;
                    if (hasNestedActions) {
                        // Children
                        parents.push(currentActionName);
                        const newActionKeys = Object.keys(actions[currentActionName]["actions"]);
                        newActionKeys.forEach(action => {
                            stack.push(action);
                        });
                        parentCounter = newActionKeys.length;
                    }
                }
            }
            const result = this.sortAzureWorkflowRunActionInfoByStartTime(azureWorkflowRunActions);
            return result;
        }
    }

    private sortAzureWorkflowRunActionInfoByStartTime(actions: AzureWorkflowRunActionData[]): AzureWorkflowRunActionData[] {
        let sortedActions = [...actions.sort((a, b) => a.order - b.order)];
        sortedActions = [...sortedActions.sort((a, b) => (a.parents?.length || 0) - (b.parents?.length || 0))];
        return sortedActions;
    }

    private sortAzureWorkflowRunActionInfoByStartTimeAndParents(actions: AzureWorkflowRunActionData[]): AzureWorkflowRunActionData[] {
        let sortedActions = [...actions.sort((a, b) => a.order - b.order)];
        sortedActions = [...sortedActions.sort((a, b) => (a.parents?.length || 0) - (b.parents?.length || 0))];
        return sortedActions;
    }
}