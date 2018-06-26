import PersistentService from "../persistentService";
import * as Discord from "discord.js";
import fetch from "node-fetch";

const setAsyncInterval = (callback: () => Promise<void>, delay: number) => setInterval(() => callback().catch(console.error), delay);

interface IRun {
	game: string;
	runner: string;
	estimate: string;
	date: string;
}

interface IAPIResponse {
	current: IRun,
	next: IRun
}

class GDQService implements PersistentService {

	private _currentRun?: IRun;
	private _nextRun?: IRun;
	private _apiUrl = "https://us-central1-gdq-api.cloudfunctions.net/status";
	private _channels = ["agdq", "sgdq", "gdq"];

	private async queryAPI(): Promise<IAPIResponse> {
		const response = await fetch(this._apiUrl);
		if (response.status !== 200) { throw new Error("Could not reach API"); }

		return response.json();
	}

	private async updateRun(type: string, backend: any) {
		if (type !== "DISCORD") return;
		const client = backend as Discord.Client;

		const channelTopic = await this.buildChannelTopic();
		if (!channelTopic) return;

		const channels = await client.channels.filter(channel => {
			if (channel.type !== "text") return false;

			const textChannel = channel as Discord.TextChannel;
			return this._channels.includes(textChannel.name);
		});

		Promise.all(channels.map(async (channel) => {
			const textChannel = channel as Discord.TextChannel;

			const permissions = await textChannel.permissionsFor(client.user);
			if (permissions.has("MANAGE_CHANNELS")) {
				await textChannel.setTopic(channelTopic);
			};
		}));
	}

	private async buildChannelTopic() {
		const { current: currentRun, next: nextRun } = await this.queryAPI();
		if (this._currentRun === currentRun && this._nextRun === nextRun) { return; }

		this._currentRun === currentRun;
		this._nextRun === nextRun;

		const currentRunString = `Now: ${currentRun.game} (${this.formatTime(currentRun.estimate)})`;
		const nextRunString = `In ${this.getMinuteDifference(new Date(nextRun.estimate))}: ${nextRun.game}`;

		const channelTopicString = currentRunString + nextRunString;
		return channelTopicString;
	}

	private formatTime(time: string) {
		const arr = time.split(":");
		arr.pop();
		return arr.join(":");
	}

	private getMinuteDifference(thenDate: Date) {
		const now = new Date();
		const nowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
			now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));

		const difference = new Date(Math.abs(+thenDate - +now));
		return difference.getMinutes();
	}

	async backendInitialized(type: string, backend: any) {
		setAsyncInterval(() => this.updateRun(type, backend), 30000);
	}

}