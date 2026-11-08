// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
		interface PageState {
			showUserSettingsModal?: {
				show: boolean;
				bgColor?: string;
				bgTexture?: string;
			};
			showUserPromotionModal?: {
				show: boolean;
				userId: number;
			},
			showUserMuteModal?: {
				show: boolean;
				userId: number;
			},
			showUserFollowRequestModal?: {
				show: boolean;
				userId: number;
			},
			showFollowModal?: {
				show: boolean;
				userId: number;
			},
			showRoomSettingsModal?: boolean;
			showHelpModal?: boolean;
			showPollModal?: boolean;
			showRevertModal?: boolean;
			showReportRoomModal?: boolean;
			showReplayRecordingOptions?: boolean;
			showHelpModal?: boolean;
		}
	}
}

export { };
