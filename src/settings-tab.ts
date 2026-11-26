import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { AiPanelSettingsComponent } from './ui/settings/settings.component'

/** @hidden */
@Injectable()
export class AiPanelSettingsTabProvider extends SettingsTabProvider {
    id = 'ai-panel-oaisub'
    icon = 'robot'
    title = 'AI Panel-oAIsub'

    getComponentType (): any {
        return AiPanelSettingsComponent
    }
}
