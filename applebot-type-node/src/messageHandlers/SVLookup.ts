import MessageHandler from "../messageHandler";
import ExtendedInfo from "../extendedInfo";
import TwitchExtendedInfo from "../extendedInfos/twitchExtendedInfo";
import MessageFloodgate from "../messageFloodgate";
import * as Discord from "discord.js";
import DiscordExtendedInfo from "../extendedInfos/discordExtendedInfo";
import fetch from "node-fetch";

interface Card {
	card_id: number,
	card_name: string,
	clan: number,
	tribe_name: string,
	skill_disc: string,
	evo_skill_disc: string,
	cost: number,
	atk: number,
	life: number,
	evo_atk: number,
	evo_life: number,
	rarity: number,
	char_type: number,
	card_set_id: number,
	description: string,
	evo_description: string,
	base_card_id: number,
	normal_card_id: number,
	use_red_ether: number,
	rotation_legal: boolean
}

interface CardCount {
    [details: string] : number;
} 

enum Craft {
    Neutral = 0,
	Forestcraft,
	Swordcraft,
	Runecraft,
	Dragoncraft,
	Shadowcraft,
	Bloodcraft,
	Havencraft
}

enum Rarity {
	Bronze = 1,
	Silver,
	Gold,
	Legendary
}

enum Set {
	"Basic Card" = 10000,
	"Standard",
	"Darkness Evolved",
	"Rise of Bahamut",
	"Tempest of the Gods",
	"Wonderland Dreams",
	"Starforged Legends",
	"Token" = 90000
}

class SVLookup implements MessageHandler {

	static keywords = /(Clash:?|Storm:?|Rush:?|Bane:?|Drain:?|Spellboost:?|Ward:?|Fanfare:?|Last Words:?|Evolve:|Earth Rite:?|Overflow:?|Vengeance:?|Evolve:?|Necromancy \((\d{1}|\d{2})\):?|Enhance \((\d{1}|\d{2})\):?|Countdown \((\d{1}|\d{2})\):?|Necromancy:?|Enhance:?|Countdown:?)/g

	private _cards: Card[];
	private flagHelp: String = "{{a/cardname}} - display card **a**rt\n" + 
		"{{e/cardname}} - **e**volved card art\n" +
		"{{aa/cardname}} - display **a**lternate **a**rt\n" + 
		"{{ae/cardname}} - **a**lternate **e**volved art\n" + 
		"{{l/cardname}} - display **l**ore / flavor text\n" +
		"{{s/cardname}} - **s**earch card text\n" +
		"{{d/deckcode}} - Display **d**eck"
	
	private constructor(cards: Card[]) {
		this._cards = cards;
	}

	public static async create() {
		const request = await fetch(`https://shadowverse-portal.com/api/v1/cards?format=json&lang=en`);
		const json = await request.json();
		const cards = json.data.cards as Card[];
		for (let c of cards) { // keyword highlighting and dealing with malformed api data
			c.card_name = c.card_name.replace("\\", "").trim();
			c.skill_disc = SVLookup.escape(c.skill_disc).replace(SVLookup.keywords, "**$&**").trim();
			c.evo_skill_disc = SVLookup.escape(c.evo_skill_disc).replace(SVLookup.keywords, "**$&**").trim();
			c.description = SVLookup.escape(c.description);
			c.evo_description = SVLookup.escape(c.evo_description);
			if (c.card_set_id == Set["Darkness Evolved"] || c.card_set_id == Set["Standard"]) // this field doesn't exist in the api, maybe implemented later?
				c.rotation_legal = false;
			else
				c.rotation_legal = true;
		}
		console.log(`Starting SVLookup with ${cards.length} cards`);
		return new SVLookup(cards);
	}
	
	static escape(text: String) { // i hate all of this
		let r = /\\u([\d\w]{4})/gi;
		text = text.replace(/<br>/g, "\n")
			.replace(/\\n/g, "\n")
			.replace(/\\\\/g, "")
			.replace("&#169;", "©")
			.replace(r, function (match, grp) {
				return String.fromCharCode(parseInt(grp, 16));
			});
		return decodeURIComponent(text as string);
	}

	private memes(card: Card) {
		if (card.card_name == "Jolly Rogers") {
			card.card_name = "Bane Rogers";
			card.skill_disc = SVLookup.escape("Fanfare: Randomly gain Bane, Bane or Bane.").replace(SVLookup.keywords, "**$&**");
		}
		return card;
	}
	
	async sendError(error: String, description: String, discordInfo: DiscordExtendedInfo) {
		await discordInfo.message.channel.send({embed: {
			color: 0xD00000,
			title: error,
			description: description
		}});
	}
	
	async handleMessage(responder: (content: string) => Promise<void>, content: string, info: ExtendedInfo | undefined) {
		if (info == undefined || info.type != "DISCORD")
			return;
		
		content = content.toLowerCase();
		const matches = content.match(/{{[a-z0-9-\+',\?\/\s]+}}/g);
		if (matches == null)
			return;

		for (let m of matches) {
			const optionMatches = m.match(/[a-z]+(?=\/)/);
			let options = "";
			if (optionMatches != null)
				options = optionMatches[0].toString();
			let target = m.slice(2, -2).replace(options + "/", "");
			const discordInfo = info as DiscordExtendedInfo;

			if ((target == "help" || target == "?") && options == "") {
				this.sendError("Find cards by typing their name in double brackets, like {{Bahamut}} or {{baha}}.", this.flagHelp, discordInfo);
				continue;
			}

			if (options == "s") {
				const results = this._cards.filter(x => x.skill_disc.toLowerCase().includes(target) || x.evo_skill_disc.toLowerCase().includes(target))
					.reduce<Card[]>((acc, val) => acc.find(x => x.card_name == val.card_name) ? acc : [...acc, val], []);
				if (results.length == 0) {
					await this.sendError(`No cards contain the text "${target}".`, "", discordInfo);
					continue;
				} else if (results.length == 1) {
					options = "";
					target = results[0].card_name.toLowerCase();
				} else {
					let embed = new Discord.RichEmbed().setColor(0xF6C7C7);
					let earlyout = false;
					for(let c = 0; c <= 7; c++) {
						const matchTitles = results.filter(x => x.clan == c).reduce<string>((acc, val) => acc + val.card_name + " - ", "").slice(0, -2);
						if (matchTitles != "") {
							if (matchTitles.length <= 1024)
								embed.addField(Craft[c], matchTitles, false);
							else {
								await this.sendError("Too many matches. Please be more specific.", "", discordInfo);
								earlyout = true;
								break;
							}
						}

					}
					if (!earlyout)
						await discordInfo.message.channel.send({embed});
					continue;
				}
			}

			if (options == "d") {
				const request = await fetch(`https://shadowverse-portal.com/api/v1/deck/import?format=json&deck_code=${target}&lang=en`);
				const json = await request.json();
				if (json.data.errors.length == 0) {
					const hash = json.data.hash;
					const embed = new Discord.RichEmbed();
					const deckRequest = await fetch(`https://shadowverse-portal.com/api/v1/deck?format=json&hash=${hash}&lang=en`);
					const rawJson = await deckRequest.json();
					const deckJson = rawJson.data.deck;
					const deck = (deckJson.cards as Card[]);
					// let counts: CardCount = {};
					// (deckJson.cards as Card[]).forEach(function(x) { counts[x.card_name] = (counts[x.card_name] || 0)+1; });
					// let deckString = Object.keys(counts).reduce((acc, val) => acc + `${counts[val]}x ${val}\n`, "");
					const vials = deck.map(x => x.use_red_ether).reduce((a, b) => a + b, 0);
					const format = deck.every(x => x.rotation_legal == true) ? "Rotation" : "Unlimited";
					embed.setFooter(`Deck code expired? Click the link to generate another.`)
						.setTitle( `${Craft[deckJson.clan]} Deck - ${target}`)
						.setFooter(`${format} Format - ${vials} vials - Click link to generate new deck code`)
						.setImage(`https://shadowverse-portal.com/image/${hash}?lang=en`)
						.setURL(`https://shadowverse-portal.com/deck/${hash}`)
						.setColor(0xF6C7C7);
					await discordInfo.message.channel.send({embed});
				} else {
					await this.sendError(json.data.errors[0].message, "", discordInfo);
				}
				continue;
			}

			let cards = this._cards.filter(x => x.card_name.toLowerCase().includes(target));
			if (cards.length < 1) {
				await this.sendError(`"${target}" doesn't match any cards. Check for spelling errors?`, "", discordInfo);
				continue;
			}
			const uniqueCards = cards.reduce<Card[]>((acc, val) => acc.find(x => x.card_name == val.card_name) ? acc : [...acc, val], []);
			let card;
			if (uniqueCards.length > 1) {
				const exactMatches = uniqueCards.filter(x => x.card_name.toLowerCase() == target.toLowerCase());
				if (exactMatches.length == 1)
					card = exactMatches[0];
				else {
					if (uniqueCards.length <= 6) {
						const matchTitles = uniqueCards.reduce<string>((acc, val) => acc + "- " + val.card_name + "\n", "");
						await this.sendError(`"${target}" matches multiple cards. Could you be more specific?`, matchTitles, discordInfo);
					} else {
						await this.sendError(`"${target}" matches a large number of cards. Could you be more specific?`, "", discordInfo);
					}
					continue;
				}
			} else {
				card = uniqueCards[0];
			}

			let copiedCard = Object.assign({}, card);
			card = this.memes(copiedCard); // keeps meme changes out of card db, not sure if this is 100% the right way

			let cardname = card.card_name; // TODO: figure out why i can't access the card object from filter statements
			let embed = new Discord.RichEmbed().setTitle(card.card_name);

			switch (card.rarity) {
				case Rarity.Bronze: {
					embed.setColor(0xCD7F32);
					break;
				}
				case Rarity.Silver: {
					embed.setColor(0xC0C0C0);
					break;
				}
				case Rarity.Gold: {
					embed.setColor(0xFFD700);
					break;
				}
				case Rarity.Legendary: {
					embed.setColor(0xB9F2FF);
					break;
				}
			}

			switch (options) {
				case "a":
				case "e":
				case "aa":
				case "ae": {
					let evolved = ["e", "ae"].includes(options);
					let alternate = ["aa", "ae"].includes(options);
					let matches = cards.filter(x => x.card_name == cardname).length
					if (card.base_card_id != card.normal_card_id) { // alternate reprints (Ta-G, AGRS, etc)
						let baseID = card.base_card_id; // TODO: filter syntax
						card = this._cards.filter(x => x.card_id == baseID)[0];
						alternate = true;
					} else if (matches <= 1 && alternate) {
						await this.sendError(`"${card.card_name}" doesn't have alt art. Try "e/${target}" for evolved art.`, "", discordInfo);
						continue;
					}
					if (card.char_type != 1 && evolved) {
						await this.sendError(`"${card.card_name}" doesn't have evolved art.`, "", discordInfo);
						continue;
					}
					const cleanName = card.card_name.toLowerCase().replace(/\W/g, '').trim();
					console.log("http://sv.bagoum.com/getRawImage/" + (evolved ? "1" : "0") + "/" + (alternate ? "1" : "0") + "/" + cleanName + "| ");
					embed.setImage("http://sv.bagoum.com/getRawImage/" + (evolved ? "1" : "0") + "/" + (alternate ? "1" : "0") + "/" + cleanName);
					if (matches > 1 && !alternate)
						embed.setFooter(`Alt art available! Use "aa" or "ae"`);
					break;
				}
				case "f":
				case "l": {
					embed.setThumbnail(`https://shadowverse-portal.com/image/card/en/C_${card.card_id}.png`);
					console.log(card.description);
					if (card.char_type == 1)
						embed.setDescription("*" + card.description + "\n\n" + card.evo_description + "*");
					else
						embed.setDescription("*" + card.description + "*");
					break;
				}
				case "": {
					let legality = "(Rotation)"
					if (card.rotation_legal == false)
						legality = "(Unlimited)";
					else if (card.card_set_id == Set["Token"])
						legality = "";
					let sanitizedTribe = (card.tribe_name == "-") ? "" : `(${card.tribe_name})`;
					embed.setURL(`http://sv.bagoum.com/cards/${card.card_id}`)
					.setThumbnail(`https://shadowverse-portal.com/image/card/en/C_${card.card_id}.png`)
					.setFooter(Craft[card.clan] + " " + Rarity[card.rarity] + " - " + Set[card.card_set_id] + " " + legality);
					switch (card.char_type) {
						case 1: {
							embed.setDescription(`${card.atk}/${card.life} ➤ ${card.evo_atk}/${card.evo_life} - ${card.cost}PP Follower ${sanitizedTribe}\n\n${card.skill_disc}`)
							if (card.evo_skill_disc != card.skill_disc && card.evo_skill_disc != "" && !(card.skill_disc.includes(card.evo_skill_disc))) {
								embed.addField("Evolved", card.evo_skill_disc, true);
								console.log(card.skill_disc);
								console.log(card.evo_skill_disc);
							}

							break;
						}
						case 2:
						case 3: {
							embed.setDescription(`${card.cost}PP Amulet ${sanitizedTribe}\n\n` + card.skill_disc);
							break;
						}
						case 4: {
							embed.setDescription(`${card.cost}PP Spell ${sanitizedTribe}\n\n` + card.skill_disc);
							break;
						}
					}
					break;
				}
				default: {
					await this.sendError(`"${options}" is not a valid options flag. Try one of these.`, this.flagHelp, discordInfo);
					continue;
				}

			}

			embed.setURL(`http://sv.bagoum.com/cards/${card.card_id}`); // done late to account for jank altarts
	
			await discordInfo.message.channel.send({embed});
		}
	}

}

export default SVLookup;