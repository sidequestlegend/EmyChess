using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace ChessTable
{
    /// <summary>Writes the imported upstream prefab's hierarchy to Logs/chess_dump.txt (what the kit builder works from).</summary>
    public static class ChessDump
    {
        [MenuItem("PortKit/Chess/Dump Upstream Prefab")]
        public static void Dump()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ChessKitBuilder.UpstreamPrefab);
            var text = new StringBuilder();
            if (prefab == null) text.AppendLine("no prefab at " + ChessKitBuilder.UpstreamPrefab);
            else Walk(prefab.transform, 0, text);
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/chess_dump.txt", text.ToString());
        }

        static void Walk(Transform t, int depth, StringBuilder text)
        {
            var comps = t.GetComponents<Component>().Select(c => c == null ? "MISSING" : c.GetType().Name).Where(n => n != "Transform");
            string rect = t is RectTransform r ? $" rect={r.rect.width:0.###}x{r.rect.height:0.###} piv={r.pivot}" : "";
            text.AppendLine($"{new string(' ', depth * 2)}{t.name} [{(t.gameObject.activeSelf ? "on" : "off")} L{t.gameObject.layer}] p={t.localPosition:F3} r={t.localEulerAngles:F1} s={t.localScale:F3}{rect} :: {string.Join(", ", comps)}");
            foreach (var c in t.GetComponents<Component>())
            {
                if (c is UnityEngine.UI.Text ui) text.AppendLine($"{new string(' ', depth * 2 + 4)}text '{ui.text.Replace("\n", "\\n")}' size {ui.fontSize} font {(ui.font ? ui.font.name : "null")} align {ui.alignment} color {ui.color}");
                if (c is MeshFilter mf && mf.sharedMesh) text.AppendLine($"{new string(' ', depth * 2 + 4)}mesh {mf.sharedMesh.name} bounds {mf.sharedMesh.bounds}");
                if (c is Renderer re) text.AppendLine($"{new string(' ', depth * 2 + 4)}materials {string.Join(", ", re.sharedMaterials.Select(m => m ? m.name + "(" + m.shader.name + ")" : "null"))}");
                if (c is BoxCollider bc) text.AppendLine($"{new string(' ', depth * 2 + 4)}box {bc.center:F3} {bc.size:F3}");
                if (c is Canvas cv) text.AppendLine($"{new string(' ', depth * 2 + 4)}canvas mode {cv.renderMode}");
            }
            foreach (Transform child in t) Walk(child, depth + 1, text);
        }
    }
}
