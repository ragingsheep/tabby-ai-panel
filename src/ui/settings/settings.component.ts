import { Component, OnDestroy, OnInit, NgZone, ChangeDetectorRef } from '@angular/core'
import { Subscription } from 'rxjs'
import { ConfigService, PlatformService } from 'tabby-core'
import { OpenAICompatibleProvider } from '../../core/llm/openai-compatible'
import { ChatGPTProvider, accountAction, cancelChatGPTRequests } from '../../core/llm/chatgpt-provider'
import { SessionStoreService } from '../../core/session-store.service'
import { CatalogState, ModelCatalogService } from '../../core/model-catalog.service'
import { AiPanelConfig, CONFIG_KEY, DEFAULT_CONFIG } from '../../types/config'

@Component({
    selector: 'ai-panel-oaisub-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
})
export class AiPanelSettingsComponent implements OnInit, OnDestroy {
    catalogState: CatalogState = { status: 'unconfigured', models: [] }
    accountBusy = false
    accountRefreshing = false
    accountError = ''
    account: any = null
    profiles: any[] = []
    testing = false
    testResult: { ok: boolean, message: string } | null = null
    extraParamsError: string | null = null
    private sub = new Subscription()
    private reloadTimer: any = null

    constructor (
        public config: ConfigService,
        private platform: PlatformService,
        public store: SessionStoreService,
        private catalog: ModelCatalogService,
        private zone: NgZone,
        private changeDetector: ChangeDetectorRef,
    ) {}

    ngOnInit (): void {
        this.config.store[CONFIG_KEY] ??= {}
        for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
            this.config.store[CONFIG_KEY][k] ??= v
        }
        this.validateExtraParams()
        this.sub.add(this.catalog.state$.subscribe(state => {
            this.catalogState = state
            // Subscription defaults are selected centrally in the catalog service.
            if (this.c.provider !== 'chatgpt' && state.status === 'ready' && state.models.length === 1 && !this.selectedModel) {
                this.selectedModel = state.models[0].id
                this.save()
            }
            this.changeDetector.markForCheck()
        }))
        if (this.c.provider === 'chatgpt') void this.loadAccount()
        void this.catalog.ensure()
    }

    ngOnDestroy (): void {
        this.sub.unsubscribe()
        clearTimeout(this.reloadTimer)
    }

    /** Endpoint or API key edited: reload the model list once typing pauses. */
    connectionChanged (): void {
        clearTimeout(this.reloadTimer)
        this.reloadTimer = setTimeout(() => void this.catalog.refresh(), 800)
    }

    get selectedModel (): string { return this.c.provider === 'chatgpt' ? this.c.chatgptModel : this.c.model }
    set selectedModel (value: string) {
        if (this.c.provider === 'chatgpt') this.c.chatgptModel = value
        else this.c.model = value
    }

    async loadAccount (): Promise<void> {
        if (this.accountRefreshing) return
        this.accountRefreshing = true
        try {
            const account = await accountAction('session')
            const profiles = await accountAction('profiles')
            this.zone.run(() => {
                this.account = account
                this.profiles = profiles
                this.changeDetector.markForCheck()
            })
        } catch (e) {
            this.zone.run(() => { this.accountError = (e as Error).message; this.changeDetector.markForCheck() })
        } finally {
            this.zone.run(() => { this.accountRefreshing = false; this.changeDetector.markForCheck() })
        }
    }

    async refreshAccount (): Promise<void> {
        this.accountError = ''
        await this.loadAccount()
        void this.catalog.refresh()
    }

    providerChanged (): void {
        cancelChatGPTRequests()
        this.testResult = null
        this.accountError = ''
        this.save()
        if (this.c.provider === 'chatgpt') void this.loadAccount()
        void this.catalog.refresh()
    }

    async changeAccount (op: 'signin' | 'select' | 'disconnect', options: object = {}): Promise<void> {
        if (this.accountBusy || this.accountRefreshing) return
        this.accountBusy = true
        this.accountError = ''
        cancelChatGPTRequests()
        try {
            const result = await accountAction(op, options)
            this.zone.run(() => {
                if (op !== 'disconnect') this.account = result
                this.c.chatgptModel = ''
                this.save()
                this.changeDetector.markForCheck()
            })
        } catch (e) {
            this.zone.run(() => { this.accountError = (e as Error).message; this.changeDetector.markForCheck() })
        } finally {
            await this.loadAccount()
            this.zone.run(() => {
                this.accountBusy = false
                this.changeDetector.markForCheck()
                void this.catalog.refresh()
            })
        }
    }

    cancelSignIn (): void { cancelChatGPTRequests() }
    openUsage (): void { require('electron').shell.openExternal('https://chatgpt.com/settings/usage') }

    get c (): AiPanelConfig {
        return this.config.store[CONFIG_KEY]
    }

    save (): void {
        this.config.save()
    }

    validateExtraParams (): void {
        const text = (this.c.extraParamsText ?? '').trim()
        if (!text) {
            this.extraParamsError = null
            return
        }
        try {
            const parsed = JSON.parse(text)
            this.extraParamsError = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? null : 'Must be a JSON object'
        } catch (e) {
            this.extraParamsError = (e as Error).message
        }
    }

    async test (): Promise<void> {
        this.testing = true
        this.testResult = null
        try {
            const provider = this.c.provider === 'chatgpt' ? new ChatGPTProvider(this.c.chatgptModel) : new OpenAICompatibleProvider({ endpoint: this.c.endpoint, apiKey: this.c.apiKey, model: this.c.model })
            const result = await provider.ping()
            const count = result.models?.length ?? 0
            const modelNote = count ? ` ${count} model${count === 1 ? '' : 's'} available.` : ''
            this.testResult = { ok: true, message: `Connected.${modelNote}` }
            void this.catalog.refresh()
        } catch (e) {
            this.testResult = { ok: false, message: (e as Error).message }
        } finally {
            this.testing = false
        }
    }

    openDataFolder (): void {
        this.platform.openPath(this.store.rootDir)
    }

    resetDefaults (): void {
        if (!confirm('Reset all AI Panel-oAIsub settings to defaults? Your sessions are kept.')) return
        Object.assign(this.config.store[CONFIG_KEY], DEFAULT_CONFIG)
        this.save()
    }
}
