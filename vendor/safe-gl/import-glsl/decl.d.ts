declare module "prepr" {
    export default (s: string, o: Record<string, string | ((c: string) => string)>) => string;
}
