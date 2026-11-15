# Desktop build of whisper.rn's bundled engine sources, to test a patch to
# whisper.cpp without a phone. Two programs from the same ggml objects:
#   wtest_patched  cpp/whisper.cpp as it is in node_modules (patched)
#   wtest_orig     the same file with the two patch hunks reverted
# Configure with -DRNW=<path to node_modules/whisper.rn/cpp> -DORIG=<reverted whisper.cpp>
cmake_minimum_required(VERSION 3.16)
project(wtest C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_C_STANDARD 11)

set(GGML_SRC
    ${RNW}/ggml.c
    ${RNW}/ggml.cpp
    ${RNW}/ggml-alloc.c
    ${RNW}/ggml-backend.cpp
    ${RNW}/ggml-backend-meta.cpp
    ${RNW}/ggml-backend-reg.cpp
    ${RNW}/ggml-backend-dl.cpp
    ${RNW}/ggml-cpu/amx/amx.cpp
    ${RNW}/ggml-cpu/amx/mmq.cpp
    ${RNW}/ggml-cpu/ggml-cpu.c
    ${RNW}/ggml-cpu/ggml-cpu.cpp
    ${RNW}/ggml-cpu/quants.c
    ${RNW}/ggml-cpu/traits.cpp
    ${RNW}/ggml-cpu/repack.cpp
    ${RNW}/ggml-cpu/unary-ops.cpp
    ${RNW}/ggml-cpu/binary-ops.cpp
    ${RNW}/ggml-cpu/vec.cpp
    ${RNW}/ggml-cpu/ops.cpp
    ${RNW}/ggml-cpu/arch/x86/quants.c
    ${RNW}/ggml-cpu/arch/x86/repack.cpp
    ${RNW}/ggml-opt.cpp
    ${RNW}/ggml-threading.cpp
    ${RNW}/ggml-quants.c
    ${RNW}/gguf.cpp
)

add_library(wggml STATIC ${GGML_SRC})
target_include_directories(wggml PUBLIC ${RNW} ${RNW}/ggml-cpu)
target_compile_definitions(wggml PUBLIC WSP_GGML_USE_CPU WSP_GGML_USE_CPU_REPACK _CRT_SECURE_NO_WARNINGS NOMINMAX)
if (MSVC)
    target_compile_options(wggml PUBLIC /arch:AVX2 /O2 /EHsc /utf-8 /W0 /bigobj)
endif ()

add_executable(wtest_patched main.cpp ${RNW}/whisper.cpp)
target_link_libraries(wtest_patched wggml)

add_executable(wtest_orig main.cpp ${ORIG})
target_link_libraries(wtest_orig wggml)
