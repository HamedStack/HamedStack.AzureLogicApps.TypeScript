export enum AzureWorkflowRunStatus {
    Aborted = "Aborted",
    Cancelled = "Cancelled",
    Failed = "Failed",
    Faulted = "Faulted",
    Ignored = "Ignored",
    NotSpecified = "NotSpecified",
    Paused = "Paused",
    Running = "Running",
    Skipped = "Skipped",
    Succeeded = "Succeeded",
    Suspended = "Suspended",
    TimedOut = "TimedOut",
    Waiting = "Waiting",
}

export enum JsonPathQuerySection {
    ActionInput = "ActionInput",
    ActionOutput = "ActionOutput",
    TriggerInput = "TriggerInput",
    TriggerOutput = "TriggerOutput",
    WorkflowRun = "WorkflowRun",
    Trigger = "Trigger",
    Action = "Action",
}