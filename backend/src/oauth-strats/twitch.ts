/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import {
    ExtendableStrategyOptions,
    ExtendableStrategyOptionsWithRequest,
    OAuth2VerifyCallback,
    OAuth2VerifyFunction,
    OAuth2VerifyFunctionWithRequest,
    OAuth2VerifyFunctionWithResults,
    OAuth2VerifyFunctionWithRequestAndResults
} from "@oauth-everything/oauth2-types";
import { Strategy, InternalOAuthError } from "passport-oauth2";
import { Profile as OAuth2Profile } from "@oauth-everything/profile";

export interface User {

    /** User’s broadcaster type: "partner", "affiliate", or "". */
    broadcaster_type: "partner" | "affiliate" | "";

    /** User’s channel description. */
    description: string;

    /** User’s display name. */
    display_name: string;

    /** User’s email address. Returned if the request includes the user:read:email scope. */
    email: string;

    /** User’s ID. */
    id: string;

    /** User’s login name. */
    login: string;

    /** URL of the user’s offline image. */
    offline_image_url: string;

    /** URL of the user’s profile image. */
    profile_image_url: string;

    /** User’s type: "staff", "admin", "global_mod", or "". */
    type: "staff" | "admin" | "global_mod" | "";

    /** Total number of views of the user’s channel. */
    view_count: number;

}
export interface UsersResponse {
    data: User[];
}
export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}
export type Profile = OAuth2Profile<UsersResponse>;
export type StrategyOptions = ExtendableStrategyOptions<{}>;
export type StrategyOptionsWithRequest = ExtendableStrategyOptionsWithRequest<{}>;
export type VerifyCallback<TUser = object, TInfo = object> = OAuth2VerifyCallback<TUser, TInfo>;
export type VerifyFunction<TUser, TInfo> = OAuth2VerifyFunction<Profile, TUser, TInfo>;
export type VerifyFunctionWithRequest<TUser, TInfo> = OAuth2VerifyFunctionWithRequest<Profile, TUser, TInfo>;
export type VerifyFunctionWithResults<TUser, TInfo> = OAuth2VerifyFunctionWithResults<TokenResponse, Profile, TUser, TInfo>;
export type VerifyFunctionWithRequestAndResults<TUser, TInfo> = OAuth2VerifyFunctionWithRequestAndResults<TokenResponse, Profile, TUser, TInfo>;

export default class extends Strategy {
    public override name = "twitch";
    private clientID: string;

    constructor(options: any, verify: any) {
        super({
            authorizationURL: "https://id.twitch.tv/oauth2/authorize",
            tokenURL: "https://id.twitch.tv/oauth2/token",
            ...options
        }, verify);

        this.clientID = options.clientID;
    }
    override userProfile(accessToken: string, done: Function) {
        this._oauth2.useAuthorizationHeaderforGET(true);
        let headers = {
            'Authorization': "Bearer " + accessToken,
            'Client-ID': this.clientID
        };

        //@ts-expect-error ._request isn't actually protected
        this._oauth2._request("GET", "https://api.twitch.tv/helix/users", headers, "", "", (error, result: any) => {
            if (error)
                return done(new InternalOAuthError("Failed to fetch user profile", error));
            let json;
            try {
                json = JSON.parse(result);
            }
            catch (parseError) {
                return done(new InternalOAuthError("Failed to parse user profile", parseError));
            }
            if (!json.data || !Array.isArray(json.data) || json.data.length !== 1)
                return done(new Error("Unexpected user profile format"));
            done(null, {
                provider: this.name,
                id: json.data[0].id,
                username: json.data[0].login,
                displayName: json.data[0].display_name,
                aboutMe: json.data[0].description,
                profileUrl: `https://www.twitch.tv/${json.data[0].login}`,
                emails: json.data[0].email ? [{ value: json.data[0].email }] : [],
                _raw: result,
                _json: json
            });
        });
    }
}
