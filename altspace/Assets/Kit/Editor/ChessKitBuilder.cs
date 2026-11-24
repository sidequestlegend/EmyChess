// The chess-table kit: EmyChess.prefab (emymin/EmyChess, art CC BY-SA 4.0) made into a kit the snippet script loads.
// What changes against upstream, and why, is in altspace/PORT.md (sections 6 and 10).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json.Linq;
using PortKit;
using TMPro;
using Unity.VisualScripting;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace ChessTable
{
    public sealed class ChessKitBuilder : KitBuilder
    {
        public const string UpstreamPrefab = "Assets/Upstream/Packages/com.emymin.emychess/Runtime/EmyChess.prefab";
        const string WoodTexture = "Assets/Upstream/Packages/com.emymin.emychess/Runtime/Materials/wood.png";
        const string MaterialFolder = "Assets/Kit/Materials";
        const string FontFolder = "Assets/Kit/Fonts";
        /// <summary>
        /// Upstream is 1 unit a square (an 8 m board). The kit is a table-top set: 1/16, a 0.5 m board and a 9.8 cm king.
        /// The snippet's scale multiplies this.
        /// </summary>
        public const float KitScale = 0.0625f;

        /// <summary>Pool order: Board.pieceAmounts and the pools under pieces_pools (20, 8, 8, 8, 16, 8).</summary>
        static readonly string[] PoolTypes = { "pawn", "bishop", "king", "knight", "queen", "rook" };
        /// <summary>The clock's digit fields: drawn with the LCD digits (DSEG7 Classic); every other text with LiberationSans.</summary>
        static readonly string[] LcdTexts = { "LeftTimer", "LeftMilliseconds", "RightTimer", "RightMilliseconds", "MovesCounter" };

        public override string Slug => "chess-table";
        public override string Title => "Chess Table";
        public override string Summary => "Two-player chess with legal moves, a chess clock and a free-play mode. A port of EmyChess.";
        public override string Description =>
            "Chess for two players with spectators: legal moves with castling, en passant and promotion, check, checkmate, stalemate " +
            "and dead-position draws, a chess clock that can run itself, and Anarchy mode (free moves, place and remove pieces). " +
            "Pick pieces up and put them down, or click a piece and then a square. A port of EmyChess by emymin " +
            "(https://github.com/emymin/EmyChess): code GPL-3.0, art CC BY-SA 4.0; the credits panel on the board lists every licence.";

        /// <summary>A table-top set: the base of the board at table height.</summary>
        public override string SnippetPosition => "0 0.75 0";
        /// <summary>PORT.md 8.1: what a fresh table starts with (room: two elements with the same room share one game).</summary>
        public override IReadOnlyList<(string name, string value)> SnippetSettings => new[]
        {
            ("room", ""), ("mode", "standard"), ("auto-timer", "false"), ("clock", "0"), ("input", "auto"), ("allow-anarchy", "true"), ("sound", "true"),
        };

        // what Compose found, for Finishing
        GameObject set;
        TMP_FontAsset lcdFont;
        Material bannerMaterial;

        protected override void Compose(KitStage stage)
        {
            var upstream = AssetDatabase.LoadAssetAtPath<GameObject>(UpstreamPrefab) ?? throw new Exception($"no upstream prefab at {UpstreamPrefab}: run the importer");
            set = stage.Copy(upstream, null, "EmyChess");
            set.transform.localScale = Vector3.one * KitScale;
            Transform F(string path) => set.transform.Find(path) ?? throw new Exception($"the upstream prefab has no '{path}'");

            // VRChat's layers mean nothing here (17 Walkthrough, 13 Pickup): everything starts on Default and the bound
            // objects get UI (click) or Grabbable (grab) from the kit builder.
            foreach (var t in set.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = 0;

            var manager = F("ChessManager").GetComponent<Emychess.ChessManager>();
            var board = F("ChessSet/Board");
            var boardBehaviour = board.GetComponent<Emychess.Board>();
            var timer = F("Timer").GetComponent<Emychess.Timer>();
            var piecesParent = F("ChessSet/Board/pieces_parent");
            var picker = F("ChessSet/Board/additional_transforms/PromotionPicker");

            // ---- D7: the picker's buttons and reference_pawn still carry a Piece behaviour with nothing set; the bishop
            //      button keeps the piece's BoxCollider beside its CapsuleCollider ----
            foreach (var stray in picker.GetComponentsInChildren<Emychess.Piece>(true)) Object.DestroyImmediate(stray);
            var bishopButton = picker.Find("Pieces/bishop");
            foreach (var box in bishopButton.GetComponents<BoxCollider>()) Object.DestroyImmediate(box);
            Object.DestroyImmediate(picker.Find("reference_pawn").gameObject);

            // ---- materials (URP; upstream's are the built-in pipeline's Standard) ----
            var materials = Materials(board.GetComponent<MeshFilter>().sharedMesh);
            foreach (var renderer in set.GetComponentsInChildren<Renderer>(true))
            {
                var shared = renderer.sharedMaterials;
                for (int i = 0; i < shared.Length; i++)
                    if (shared[i] != null && materials.TryGetValue(shared[i].name, out var mine)) shared[i] = mine;
                renderer.sharedMaterials = shared;
            }

            // ---- the pools: pieces move under pieces_parent (upstream reparents each at its first use; the page cannot) ----
            var pools = F("ChessSet/Board/pieces_pools");
            var poolTokens = new Dictionary<string, object>();
            foreach (var type in PoolTypes)
            {
                var poolObject = pools.Find(type).gameObject;
                var members = poolObject.transform.Cast<Transform>().Select(t => t.gameObject).ToList();
                foreach (var piece in members)
                {
                    piece.transform.SetParent(piecesParent, false);
                    piece.transform.localPosition = Vector3.zero;
                    piece.transform.localRotation = Quaternion.identity;
                    stage.Object(piece, key: piece.name, grab: true);
                    stage.Ref(piece);                                                                 // colour and sound go through the relay
                    var audio = piece.GetComponent<AudioSource>();
                    if (audio != null) { audio.playOnAwake = false; audio.spatialBlend = 1f; audio.maxDistance = 3f; audio.rolloffMode = AudioRolloffMode.Linear; }
                }
                poolTokens[type] = stage.Behaviour(poolObject, "VRCObjectPool",
                    new JObject { ["poolName"] = type, ["Pool"] = new JArray(members.Select(m => (JToken)stage.ObjectValue(m))) });
            }

            // ---- the 64 squares: tints (upstream draws them in its board shader) and click targets for click-to-move ----
            var squares = stage.Create("squares", board);
            squares.transform.localScale = Vector3.one * 100f;                                         // the same space as pieces_parent
            var clickToMove = stage.Behaviour(squares, "ClickToMove", new JObject { ["board"] = stage.BehaviourValue(boardBehaviour) });
            var squareRenderers = new JArray();
            for (int x = 0; x < 8; x++)
                for (int y = 0; y < 8; y++)
                {
                    string name = "abcdefgh"[x] + (y + 1).ToString();
                    var square = stage.Primitive(PrimitiveType.Quad, name, squares.transform);
                    Object.DestroyImmediate(square.GetComponent<Collider>());
                    square.transform.localPosition = new Vector3(-(x + 0.5f), 0.004f, -(y + 0.5f));
                    square.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                    var box = square.AddComponent<BoxCollider>();
                    box.size = new Vector3(1f, 1f, 0.02f);
                    var r = square.GetComponent<MeshRenderer>();
                    r.sharedMaterial = materials["SquareTint"];
                    r.shadowCastingMode = ShadowCastingMode.Off;
                    r.receiveShadows = false;
                    stage.Object(square, key: "sq_" + name, click: true);
                    stage.Ref(square);
                    stage.Behaviour(square, "BoardSquare", new JObject { ["x"] = x, ["y"] = y, ["clickToMove"] = stage.BehaviourValue(clickToMove) });
                    squareRenderers.Add(stage.ComponentValue(square, "Renderer"));
                }

            // ---- every upstream script becomes a behaviour, with what the script needs beyond the stand-in's fields ----
            stage.BehavioursFromStandIns();
            foreach (var type in new[] { "ChessManager", "Board", "DefaultRules", "GameOverMessage", "Timer", "PlayerHolder", "Piece" })
                stage.GroupType(type, "table");                                                       // one leaf, one owner, applied as a whole

            Color white = new Color(1f, 1f, 1f), black = new Color(0.189f, 0.189f, 0.189f);
            stage.Behaviour(boardBehaviour, extra: new JObject
            {
                ["squareRenderers"] = squareRenderers,
                ["whiteColor"] = new JObject { ["$color"] = new JArray(white.r, white.g, white.b, 1.0) },
                ["blackColor"] = new JObject { ["$color"] = new JArray(black.r, black.g, black.b, 1.0) },
                ["whiteSmoothness"] = 0.5, ["blackSmoothness"] = 0.162,
            });
            foreach (var piece in piecesParent.GetComponentsInChildren<Emychess.Piece>(true))
                stage.Behaviour(piece, extra: new JObject
                {
                    ["pool"] = stage.BehaviourValue(poolTokens[piece.type]),
                    ["audioSource"] = stage.ComponentValue(piece.gameObject, "AudioSource"),
                    ["pieceRenderer"] = stage.ComponentValue(piece.gameObject, "Renderer"),
                });

            var anarchyBlack = F("AnarchyControls_Black");
            var anarchyWhite = F("AnarchyControls_White");
            var anarchyButton = F("ChessSet/UIHolder/Canvas/MainMenu/GameMode/Anarchy Button").gameObject;
            stage.Ref(anarchyButton);
            foreach (var console in new[] { anarchyBlack, anarchyWhite })
            {
                var endTurn = console.Find("EndTurnButton").gameObject;
                stage.Object(endTurn, click: true);
                stage.Ref(endTurn);
                stage.Behaviour(endTurn.GetComponent<Emychess.Interactions.SendEventOnInteract>(), extra: new JObject { ["targetBehaviour"] = stage.BehaviourValue(manager) });
                var placer = console.Find("PiecePlacerHolder/PiecePlacer");
                stage.Object(placer.gameObject, grab: true);
                var placerMeshes = placer.Find("Pieces").Cast<Transform>().Select(t => (JToken)stage.ObjectValue(t.gameObject));
                stage.Behaviour(placer.GetComponent<Emychess.Interactions.PiecePlacer>(), extra: new JObject
                {
                    ["pieceMeshes"] = new JArray(placerMeshes),
                    ["clickToMove"] = stage.BehaviourValue(clickToMove),
                });
            }
            stage.Behaviour(manager, extra: new JObject
            {
                ["endTurnButton_black"] = stage.ObjectValue(anarchyBlack.Find("EndTurnButton").gameObject),
                ["endTurnButton_white"] = stage.ObjectValue(anarchyWhite.Find("EndTurnButton").gameObject),
                ["endTurnRenderer_black"] = stage.ComponentValue(anarchyBlack.Find("EndTurnButton").gameObject, "Renderer"),
                ["endTurnRenderer_white"] = stage.ComponentValue(anarchyWhite.Find("EndTurnButton").gameObject, "Renderer"),
                ["anarchyButton"] = stage.ObjectValue(anarchyButton),
                ["clickToMove"] = stage.BehaviourValue(clickToMove),
            });
            foreach (var button in timer.GetComponentsInChildren<Emychess.Interactions.TimerButton>(true))
            {
                stage.Object(button.gameObject, click: true);
                var e = button.transform.localEulerAngles;
                stage.Behaviour(button, extra: new JObject { ["baseEuler"] = new JObject { ["$v3"] = new JArray(e.x, e.y, e.z) } });
            }
            foreach (var button in picker.GetComponentsInChildren<Emychess.Interactions.PromotionButton>(true)) stage.Object(button.gameObject, click: true);

            // ---- the 15 uGUI buttons: a collider on the UI layer, the click bound to what upstream's button called ----
            var placerBlack = anarchyBlack.GetComponentInChildren<Emychess.Interactions.PiecePlacer>(true);
            var placerWhite = anarchyWhite.GetComponentInChildren<Emychess.Interactions.PiecePlacer>(true);
            var buttons = new (string path, MonoBehaviour target, string method)[]
            {
                ("ChessSet/UIHolder/Canvas/MainMenu/WhiteJoin", manager, "_RegisterWhite"),
                ("ChessSet/UIHolder/Canvas/MainMenu/BlackJoin", manager, "_RegisterBlack"),
                ("ChessSet/UIHolder/Canvas/MainMenu/GameMode/Standard Button", manager, "_SetStandardGameMode"),
                ("ChessSet/UIHolder/Canvas/MainMenu/GameMode/Anarchy Button", manager, "_SetAnarchyGameMode"),
                ("ChessSet/UIHolder/Canvas/MainMenu/StartButton", manager, "_StartGame"),
                ("ChessSet/UIHolder/Canvas/MainMenu/AutoTimerToggle/Background", manager, "_ToggleAutoTimer"),
                ("ChessSet/UIHolder/Canvas/GameMenu/endGame", manager, "_EndGame"),
                ("Timer/TimerScreen/Canvas/Reset", timer, "_ResetTimerEvent"),
                ("Timer/TimerScreen/Canvas/Add30s", timer, "_Add30s"),
                ("Timer/TimerScreen/Canvas/Add1m", timer, "_Add1m"),
                ("Timer/TimerScreen/Canvas/Add15m", timer, "_Add15m"),
                ("AnarchyControls_Black/ButtonCanvas/NextType", placerBlack, "_NextType"),
                ("AnarchyControls_Black/ButtonCanvas/PreviousType", placerBlack, "_PreviousType"),
                ("AnarchyControls_White/ButtonCanvas/NextType", placerWhite, "_NextType"),
                ("AnarchyControls_White/ButtonCanvas/PreviousType", placerWhite, "_PreviousType"),
            };
            foreach (var (path, target, method) in buttons)
            {
                var go = F(path).gameObject;
                ClickCollider(go);
                stage.Event(go, "click", target, method);
            }
            // Clicks arrive through the colliders: no uGUI raycasting (it would sit in front of them, and the buttons' own
            // persistent calls go to VRChat's UdonBehaviour, which is gone). Images get no built-in sprite.
            foreach (var raycaster in set.GetComponentsInChildren<UnityEngine.UI.GraphicRaycaster>(true)) Object.DestroyImmediate(raycaster);
            foreach (var button in set.GetComponentsInChildren<UnityEngine.UI.Button>(true))
                for (int i = button.onClick.GetPersistentEventCount() - 1; i >= 0; i--) UnityEditor.Events.UnityEventTools.RemovePersistentListener(button.onClick, i);
            foreach (var image in set.GetComponentsInChildren<UnityEngine.UI.Image>(true)) { image.sprite = null; image.type = UnityEngine.UI.Image.Type.Simple; }

            // ---- every text and button a behaviour writes is reached through the relay graph ----
            foreach (var mb in set.GetComponentsInChildren<MonoBehaviour>(true))
            {
                if (mb == null || !stage.IsStandIn(mb)) continue;
                foreach (var field in mb.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance))
                {
                    var value = field.GetValue(mb);
                    foreach (var item in value is Array array ? array.Cast<object>() : new[] { value })
                        if (item is UnityEngine.UI.Text text && text != null) stage.Ref(text.gameObject);
                        else if (item is UnityEngine.UI.Button button && button != null) stage.Ref(button.gameObject);
                }
            }

            // ---- the banner turns at 90 degrees a second (upstream: one degree a frame) and starts square when shown ----
            var banner = F("ChessSet/Board/additional_transforms/GameOverMessage/GameOver").gameObject;
            var spin = new GraphWriter();
            spin.On(new Update(), _ => spin.Do(typeof(Transform), "Rotate", new[] { typeof(Vector3), typeof(float) }, null, Vector3.up, spin.Get(typeof(Time), "deltaTime") * 90f));
            spin.On(new OnEnable(), _ => spin.Set(typeof(Transform), "localRotation", null, Quaternion.identity));
            stage.AddGraph(banner, "spin", spin);

            // ---- credits: a small button on the panel opens the licence notices ----
            Credits(stage, F("ChessSet/UIHolder/Canvas"));

            // ---- fonts, made here so the kit holds what it draws with ----
            var lcdSource = AssetDatabase.LoadAssetAtPath<Font>($"{FontFolder}/DSEG7Classic-Regular.ttf") ?? throw new Exception("the LCD font is missing");
            lcdFont = KitText.StaticFontAsset(lcdSource, "0123456789: ", $"{FontFolder}/LcdDigits SDF.asset");
            bannerMaterial = BannerMaterial();
        }

        protected override void Finishing(KitStage stage)
        {
            // Legacy UI Text draws with a built-in font no bundle carries: TextMeshPro instead (the bindings already hold the
            // objects). The banner's text is not drawn from behind, as upstream's BackfaceCulledUI shader did.
            KitText.ToTextMeshPro(set,
                fontFor: t => LcdTexts.Contains(t.name) ? lcdFont : null,
                materialFor: t => t.name == "GameOverText" ? bannerMaterial : null,
                report: stage.Report);
        }

        // ------------------------------------------------------------------ pieces of the build

        static void ClickCollider(GameObject go)
        {
            var rect = go.GetComponent<RectTransform>();
            var box = go.GetComponent<BoxCollider>();
            if (box == null) box = go.AddComponent<BoxCollider>();                                    // (Unity's null: no ??)
            box.center = rect.rect.center;
            box.size = new Vector3(rect.rect.width, rect.rect.height, Mathf.Min(rect.rect.width, rect.rect.height) * 0.2f);
        }

        void Credits(KitStage stage, Transform canvas)
        {
            var font = KitText.DefaultFont();
            var open = stage.Create("CreditsButton", canvas);
            var openRect = open.AddComponent<RectTransform>();
            openRect.anchoredPosition3D = new Vector3(3.55f, -0.88f, 0f);
            openRect.sizeDelta = new Vector2(70f, 22f);
            open.transform.localScale = Vector3.one * 0.0105f;
            open.AddComponent<UnityEngine.UI.Image>().color = new Color(0.85f, 0.78f, 0.62f);
            var openLabel = stage.Create("Text", open.transform);
            var openText = openLabel.AddComponent<TextMeshProUGUI>();
            openText.rectTransform.sizeDelta = new Vector2(70f, 22f);
            openText.font = font;
            openText.fontSize = 12;
            openText.color = new Color(0.2f, 0.2f, 0.2f);
            openText.alignment = TextAlignmentOptions.Center;
            openText.text = "Credits";
            ClickCollider(open);

            var panel = stage.Create("CreditsPanel", canvas);
            var panelRect = panel.AddComponent<RectTransform>();
            panelRect.anchoredPosition3D = new Vector3(0f, 0f, -0.02f);
            panelRect.sizeDelta = new Vector2(790f, 205f);
            panel.transform.localScale = Vector3.one * 0.01f;
            panel.AddComponent<UnityEngine.UI.Image>().color = new Color(0.12f, 0.08f, 0.05f, 0.97f);
            var body = stage.Create("Text", panel.transform);
            var bodyText = body.AddComponent<TextMeshProUGUI>();
            bodyText.rectTransform.sizeDelta = new Vector2(760f, 190f);
            bodyText.font = font;
            bodyText.fontSize = 10;
            bodyText.color = Color.white;
            bodyText.alignment = TextAlignmentOptions.TopLeft;
            bodyText.textWrappingMode = TextWrappingModes.Normal;
            bodyText.text = CreditsText;
            ClickCollider(panel);
            panel.SetActive(false);

            var token = stage.Behaviour(open, "CreditsPanel", new JObject { ["panel"] = stage.ObjectValue(panel) });
            stage.Object(open, click: true);
            stage.Event(panel, "click", token, "Toggle");
        }

        const string CreditsText =
            "<b>Chess Table</b>: a port of <b>EmyChess</b> v0.1.3 by emymin, with BlackStartx, ZenithVal and BluWizard. Source: github.com/emymin/EmyChess. Port source: github.com/sidequestlegend/EmyChess (branch altspace)\n" +
            "Code (the script): GNU General Public License v3.0. The script also holds the portkit runtime (MIT).\n" +
            "Models, prefabs and materials: EmyChess, CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0). Changed for Altspace: " +
            "converted to URP, text remade in TextMesh Pro, a click target per square, scaled to a table-top set.\n" +
            "Wood texture: \"Dark wood textures\" by bart, OpenGameArt node 10010, CC0. Sounds: \"chess pieces.wav\" by simone_ds " +
            "(freesound 366065) and \"Knock_3.wav\" (freesound 144947), both CC0.\n" +
            "Fonts: Liberation Sans (SIL Open Font License 1.1); clock digits drawn from DSEG7 Classic by keshikan (SIL OFL 1.1, reserved name DSEG).\n" +
            "Not affiliated with VRChat. Click to close.";

        // ------------------------------------------------------------------ materials

        Dictionary<string, Material> Materials(Mesh boardMesh)
        {
            System.IO.Directory.CreateDirectory(MaterialFolder);
            var lit = Shader.Find("Universal Render Pipeline/Lit") ?? throw new Exception("URP Lit shader not found");
            var unlit = Shader.Find("Universal Render Pipeline/Unlit") ?? throw new Exception("URP Unlit shader not found");
            var wood = AssetDatabase.LoadAssetAtPath<Texture2D>(WoodTexture);
            var made = new Dictionary<string, Material>
            {
                ["WhitePiece"] = Lit(lit, "WhitePiece", new Color(1f, 1f, 1f), 0.5f),
                ["BlackPiece"] = Lit(lit, "BlackPiece", new Color(0.189f, 0.189f, 0.189f), 0.162f),
                ["GhostPiece"] = Transparent(Lit(lit, "GhostPiece", new Color(0.36f, 0.61f, 1f, 0.34f), 0.5f), new Color(0f, 0.43f, 1f)),
                ["Wood"] = Lit(lit, "Wood", Color.white, 0.446f, wood),
                ["RedButton"] = Lit(lit, "RedButton", new Color(0.95f, 0.55f, 0.55f), 0.5f),
                ["TimerGlass"] = Transparent(Lit(lit, "TimerGlass", new Color(1f, 1f, 1f, 0.106f), 1f), null),
                ["TimerScreen"] = Lit(lit, "TimerScreen", new Color(0.62f, 0.76f, 0.70f), 0f),
                ["Board"] = Lit(lit, "Board", Color.white, 0.536f, Checker(boardMesh)),
                ["SquareTint"] = Transparent(Save(new Material(unlit) { name = "SquareTint" }, new Color(0f, 0f, 0f, 0f)), null),
            };
            // URP's own validation (what its material inspector and import postprocessor run): keywords, blend mode, which
            // passes a material keeps. Save() rewrites an existing material from a fresh one, which drops that state, and
            // without it every material kept its motion-vector pass (and the transparent ones their depth and shadow
            // passes): more shader variants, a Windows bundle 25% larger.
            foreach (var m in made.Values)
            {
                if (m.shader == lit) BaseShaderGUI.SetMaterialKeywords(m, UnityEditor.Rendering.Universal.ShaderGUI.LitGUI.SetMaterialKeywords);
                else BaseShaderGUI.SetMaterialKeywords(m);
                EditorUtility.SetDirty(m);
            }
            AssetDatabase.SaveAssets();
            return made;
        }

        static Material Save(Material m, Color colour)
        {
            string path = $"{MaterialFolder}/{m.name}.mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null)
            {
                existing.shader = m.shader;
                existing.CopyPropertiesFromMaterial(m);
                m = existing;
            }
            else AssetDatabase.CreateAsset(m, path);
            m.SetColor("_BaseColor", colour);
            EditorUtility.SetDirty(m);
            return m;
        }

        static Material Lit(Shader shader, string name, Color colour, float smoothness, Texture texture = null)
        {
            var m = Save(new Material(shader) { name = name }, colour);
            m.SetFloat("_Smoothness", smoothness);
            m.SetTexture("_BaseMap", texture);
            m.enableInstancing = false;
            return m;
        }

        static Material Transparent(Material m, Color? emission)
        {
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_Blend", 0f);
            m.SetOverrideTag("RenderType", "Transparent");
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_SrcBlendAlpha", (float)BlendMode.One);
            m.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0f);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)RenderQueue.Transparent;
            if (emission.HasValue)
            {
                m.EnableKeyword("_EMISSION");
                m.SetColor("_EmissionColor", emission.Value);
                m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            }
            EditorUtility.SetDirty(m);
            return m;
        }

        /// <summary>
        /// The board's 8 x 8 checker (upstream's Board shader drew it from the UVs): dark (0.34, 0.16, 0) and light (1, 0.85,
        /// 0.66), with a1 dark. Which corner of the texture a1 is depends on the board mesh's UVs, so it is read from the mesh:
        /// the vertex at the a1 corner (the Board object's origin; the board runs toward -x and -z).
        /// </summary>
        static Texture2D Checker(Mesh mesh)
        {
            var vertices = mesh.vertices;
            var uvs = mesh.uv;
            int at = 0;
            for (int i = 1; i < vertices.Length; i++) if (vertices[i].sqrMagnitude < vertices[at].sqrMagnitude) at = i;
            int cx = uvs[at].x < 0.5f ? 0 : 7, cy = uvs[at].y < 0.5f ? 0 : 7;
            var dark = new Color32(87, 41, 0, 255);
            var light = new Color32(255, 217, 168, 255);
            var texture = new Texture2D(8, 8, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = "BoardChecker" };
            for (int x = 0; x < 8; x++)
                for (int y = 0; y < 8; y++)
                    texture.SetPixel(x, y, (x + y) % 2 == (cx + cy) % 2 ? dark : light);
            texture.Apply();
            string path = $"{MaterialFolder}/BoardChecker.png";
            System.IO.File.WriteAllBytes(path, texture.EncodeToPNG());
            AssetDatabase.ImportAsset(path);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.filterMode = FilterMode.Point;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.mipmapEnabled = false;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.sRGBTexture = true;
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        /// <summary>LiberationSans SDF's material with back faces culled, for the turning banner.</summary>
        static Material BannerMaterial()
        {
            var font = KitText.DefaultFont();
            string path = $"{MaterialFolder}/BannerText.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(font.material) { name = "BannerText" };
                AssetDatabase.CreateAsset(m, path);
            }
            else m.CopyPropertiesFromMaterial(font.material);
            m.SetFloat("_CullMode", (float)CullMode.Back);
            EditorUtility.SetDirty(m);
            return m;
        }
    }
}
