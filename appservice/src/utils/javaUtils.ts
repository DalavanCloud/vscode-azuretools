/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { StringDictionary } from "azure-arm-website/lib/models";
import { UserCancelledError } from "vscode-azureextensionui";
import { ext } from '../extensionVariables';
import { SiteClient } from "../SiteClient";

export namespace javaUtils {
    const DEFAULT_PORT: string = '8080';
    const PORT_KEY: string = 'PORT';

    export function isJavaTomcatRuntime(runtime: string | undefined): boolean {
        return runtime && runtime.toLowerCase().startsWith('tomcat');
    }

    export function isJavaSERuntime(runtime: string | undefined): boolean {
        return runtime && runtime.toLowerCase() === 'java|8-jre8';
    }

    export function isJavaSERequiredPortConfigured(appSettings: StringDictionary | undefined): boolean {
        if (appSettings && appSettings.properties) {
            for (const key of Object.keys(appSettings.properties)) {
                if (key.toUpperCase() === PORT_KEY) {
                    return true;
                }
            }
        }
        return false;
    }

    export async function configureJavaSEAppSettings(siteClient: SiteClient): Promise<StringDictionary> {
        const appSettings: StringDictionary = await siteClient.listApplicationSettings();
        if (isJavaSERequiredPortConfigured(appSettings)) {
            return null;
        }

        appSettings.properties = appSettings.properties || {};
        const port: string = await ext.ui.showInputBox({
            value: DEFAULT_PORT,
            prompt: 'Configure the PORT (Application Settings) which your Java SE Web App exposes',
            placeHolder: 'PORT',
            validateInput: (input: string): string => {
                return /^[0-9]+$/.test(input) ? null : 'please specify a valid port number';
            }
        });
        if (!port) {
            throw new UserCancelledError();
        }
        appSettings.properties[PORT_KEY] = port;
        return siteClient.updateApplicationSettings(appSettings);
    }
}
