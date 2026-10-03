import pathlib,sys
root=pathlib.Path(sys.argv[1]);source=root/'src/bindings/bnd_brep.cpp'
text=source.read_text()
marker='void initBrepBindings(void*)\n{'
assert marker in text
extension=pathlib.Path(sys.argv[2]).read_text()
text=text.replace(marker,extension+'\n'+marker+'\n  function("createTerrainBrep", &ContaTerrain, allow_raw_pointers());',1)
source.write_text(text)
