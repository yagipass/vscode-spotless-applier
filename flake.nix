{
  description = "vscode-spotless-applier dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (
        pkgs:
        let
          jdk = pkgs.jdk21;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24
              pkgs.pnpm
              jdk
              (pkgs.gradle.override { java = jdk; })
              (pkgs.maven.override { jdk_headless = jdk; })
              pkgs.mvnd
            ];

            env = {
              JAVA_HOME = "${jdk.home}";
            };
          };
        }
      );
    };
}
