/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient } from 'azure-arm-website';
import { AppServicePlan, SkuDescription } from 'azure-arm-website/lib/models';
import { ProgressLocation, window } from 'vscode';
import { addExtensionUserAgent, AzureWizardExecuteStep } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { getAppServicePlanModelKind, WebsiteOS } from './AppKind';
import { IAppServiceWizardContext } from './IAppServiceWizardContext';

export class AppServicePlanCreateStep extends AzureWizardExecuteStep<IAppServiceWizardContext> {
    public async execute(wizardContext: IAppServiceWizardContext): Promise<IAppServiceWizardContext> {
        if (!wizardContext.plan) {
            // tslint:disable-next-line:no-non-null-assertion
            const newPlanName: string = wizardContext.newPlanName!;
            // tslint:disable-next-line:no-non-null-assertion
            const newSku: SkuDescription = wizardContext.newPlanSku!;
            const findingAppServicePlan: string = localize('FindingAppServicePlan', 'Ensuring App Service plan "{0}" exists...', newPlanName);
            const creatingAppServicePlan: string = localize('CreatingAppServicePlan', 'Creating App Service plan "{0}"...', newPlanName);
            const foundAppServicePlan: string = localize('FoundAppServicePlan', 'Successfully found App Service plan "{0}".', newPlanName);
            const createdAppServicePlan: string = localize('CreatedAppServicePlan', 'Successfully created App Service plan "{0}".', newPlanName);
            await window.withProgress({ location: ProgressLocation.Notification, title: findingAppServicePlan }, async (): Promise<void> => {
                ext.outputChannel.appendLine(findingAppServicePlan);
                const client: WebSiteManagementClient = new WebSiteManagementClient(wizardContext.credentials, wizardContext.subscriptionId, wizardContext.environment.resourceManagerEndpointUrl);
                addExtensionUserAgent(client);
                const existingPlan: AppServicePlan | null = await client.appServicePlans.get(wizardContext.resourceGroup.name, newPlanName);
                if (existingPlan) {
                    wizardContext.plan = existingPlan;
                    window.showInformationMessage(foundAppServicePlan);
                    ext.outputChannel.appendLine(foundAppServicePlan);
                } else {
                    ext.outputChannel.appendLine(creatingAppServicePlan);
                    window.showInformationMessage(creatingAppServicePlan);
                    wizardContext.plan = await client.appServicePlans.createOrUpdate(wizardContext.resourceGroup.name, newPlanName, {
                        kind: getAppServicePlanModelKind(wizardContext.newSiteKind, wizardContext.newSiteOS),
                        sku: newSku,
                        location: wizardContext.location.name,
                        reserved: wizardContext.newSiteOS === WebsiteOS.linux  // The secret property - must be set to true to make it a Linux plan. Confirmed by the team who owns this API.
                    });
                    window.showInformationMessage(createdAppServicePlan);
                    ext.outputChannel.appendLine(createdAppServicePlan);
                }
            });
        }

        return wizardContext;
    }
}
