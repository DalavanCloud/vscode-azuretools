/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient } from 'azure-arm-website';
import { AppServicePlan } from 'azure-arm-website/lib/models';
import { addExtensionUserAgent, AzureWizard, AzureWizardPromptStep, IAzureQuickPickOptions, LocationListStep } from 'vscode-azureextensionui';
import { IAzureQuickPickItem } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { uiUtils } from '../utils/uiUtils';
import { getWebsiteOSDisplayName, WebsiteOS } from './AppKind';
import { AppServicePlanCreateStep } from './AppServicePlanCreateStep';
import { AppServicePlanNameStep } from './AppServicePlanNameStep';
import { AppServicePlanSkuStep } from './AppServicePlanSkuStep';
import { IAppServiceWizardContext } from './IAppServiceWizardContext';

export class AppServicePlanListStep extends AzureWizardPromptStep<IAppServiceWizardContext> {
    public static async getPlans(wizardContext: IAppServiceWizardContext): Promise<AppServicePlan[]> {
        if (wizardContext.plansTask === undefined) {
            const client: WebSiteManagementClient = new WebSiteManagementClient(wizardContext.credentials, wizardContext.subscriptionId, wizardContext.environment.resourceManagerEndpointUrl);
            addExtensionUserAgent(client);
            wizardContext.plansTask = uiUtils.listAll(client.appServicePlans, client.appServicePlans.list());
        }

        return await wizardContext.plansTask;
    }

    public static async isNameAvailable(wizardContext: IAppServiceWizardContext, name: string, resourceGroupName: string): Promise<boolean> {
        const plans: AppServicePlan[] = await AppServicePlanListStep.getPlans(wizardContext);
        return !plans.some((plan: AppServicePlan) =>
            plan.resourceGroup.toLowerCase() === resourceGroupName.toLowerCase() &&
            plan.name.toLowerCase() === name.toLowerCase()
        );
    }

    public async prompt(wizardContext: IAppServiceWizardContext): Promise<IAppServiceWizardContext> {
        if (!wizardContext.plan && !wizardContext.newPlanName) {
            // Cache hosting plan separately per subscription
            const options: IAzureQuickPickOptions = { placeHolder: localize('selectPlan', 'Select a {0} App Service plan.', getWebsiteOSDisplayName(wizardContext.newSiteOS)), id: `AppServicePlanListStep/${wizardContext.subscriptionId}` };
            wizardContext.plan = (await ext.ui.showQuickPick(this.getQuickPicks(wizardContext), options)).data;

            if (wizardContext.plan) {
                await LocationListStep.setLocation(wizardContext, wizardContext.plan.location);
            } else {
                this.subWizard = new AzureWizard(
                    [new AppServicePlanNameStep(), new AppServicePlanSkuStep()],
                    [new AppServicePlanCreateStep()],
                    wizardContext
                );
            }
        }

        return wizardContext;
    }

    private async getQuickPicks(wizardContext: IAppServiceWizardContext): Promise<IAzureQuickPickItem<AppServicePlan | undefined>[]> {
        const picks: IAzureQuickPickItem<AppServicePlan | undefined>[] = [{
            label: localize('CreateNewAppServicePlan', '$(plus) Create new App Service plan'),
            description: '',
            data: undefined
        }];

        const plans: AppServicePlan[] = await AppServicePlanListStep.getPlans(wizardContext);
        for (const plan of plans) {
            const isNewSiteLinux: boolean = wizardContext.newSiteOS === WebsiteOS.linux;
            const isPlanLinux: boolean = plan.kind.toLowerCase().includes(WebsiteOS.linux);
            // plan.kind will contain "linux" for Linux plans, but will _not_ contain "windows" for Windows plans. Thus we check "isLinux" for both cases
            if (isNewSiteLinux === isPlanLinux) {
                picks.push({
                    id: plan.id,
                    label: plan.name,
                    description: `${plan.sku.name} (${plan.geoRegion})`,
                    detail: plan.resourceGroup,
                    data: plan
                });
            }
        }

        return picks;
    }
}
