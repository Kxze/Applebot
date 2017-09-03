import MessageHandler from "../messageHandler";
import ExtendedInfo from "../extendedInfo";
import TwitchExtendedInfo from "../extendedInfos/twitchExtendedInfo";
import MessageFloodgate from "../messageFloodgate";
import fetch from "node-fetch";
import * as fs from "fs";

function readSettings(): Promise<string> {
	return new Promise((resolve, reject) => {
		fs.readFile("resources/twitchuptime.json", "utf8", (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		})
	});
}

class TwitchUptime implements MessageHandler {

	private _channel: string;
	
	private constructor(channel: string) {
		this._channel = channel;
	}
	
	public static async create() {
		const data = await readSettings();
		const channel = JSON.parse(data).channel;
		return new TwitchUptime(channel);
	}

	private _floodgate = new MessageFloodgate(10);

	async handleMessage(responder: (content: string) => Promise<void>, content: string, info: ExtendedInfo | undefined) {
		const resp = this._floodgate.createResponder(responder);
		if (info == undefined || info.type != "TWITCH")
			return;

		if (/^!uptime$/.test(content)) {
			try {
				const request = await fetch(`https://decapi.me/twitch/uptime?channel=${this._channel}`);
				const text = await request.text();
				await resp(`Live for ${text}.`, false);
			} catch {
				await resp("Error retrieving uptime info—is the stream offline?", false);
			}
		}
	}

}

export default TwitchUptime;